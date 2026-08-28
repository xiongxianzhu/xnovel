"""不可信 Skill 包校验、规范化与固定 Unicode 哈希。"""

from __future__ import annotations

import hashlib
import io
import stat
import struct
import unicodedata
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

import yaml

from app.core.error_codes import ErrorCode, ErrorMessage
from app.core.exceptions import APIException

MAX_ARCHIVE_SIZE = 10 * 1024 * 1024
MAX_UNCOMPRESSED_SIZE = 50 * 1024 * 1024
MAX_FILES = 500
MAX_SKILL_MD_SIZE = 1024 * 1024
TEXT_EXTENSIONS = {".md", ".txt", ".json", ".yaml", ".yml"}
CASE_FOLDING_ASSET = Path(__file__).parents[1] / "assets" / "unicode" / "CaseFolding-17.0.0.txt"
CASE_FOLDING_SHA256 = "ff8d8fefbf123574205085d6714c36149eb946d717a0c585c27f0f4ef58c4183"


@dataclass(frozen=True)
class PreparedSkillPackage:
    name: str
    description: str
    skill_md_text: str
    files: dict[str, bytes]
    content_sha256: str
    normalized_package: bytes
    source_compressed_size: int | None
    uncompressed_size: int
    validation_summary: dict[str, Any]


def _fold_map() -> dict[int, str]:
    data = CASE_FOLDING_ASSET.read_bytes()
    if hashlib.sha256(data).hexdigest() != CASE_FOLDING_SHA256:
        raise RuntimeError("Unicode CaseFolding asset checksum mismatch")
    mapping: dict[int, str] = {}
    for raw_line in data.decode("utf-8").splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue
        code, status, values = [part.strip() for part in line.split(";")[:3]]
        if status in {"C", "F"}:
            mapping[int(code, 16)] = "".join(chr(int(value, 16)) for value in values.split())
    return mapping


_CASE_FOLD = _fold_map()


def full_case_fold_17(value: str) -> str:
    return "".join(_CASE_FOLD.get(ord(character), character) for character in value)


def normalize_skill_path(value: str) -> str:
    if "\x00" in value or "\\" in value or value.startswith(("/", "//")):
        raise _invalid("skill_path_invalid")
    path = PurePosixPath(value)
    if not path.parts or any(part in {"", ".", ".."} or ":" in part for part in path.parts):
        raise _invalid("skill_path_invalid")
    normalized = "/".join(unicodedata.normalize("NFC", part) for part in path.parts)
    try:
        normalized.encode("utf-8")
    except UnicodeEncodeError as exc:
        raise _invalid("skill_path_invalid") from exc
    return normalized


def validate_skill_files(files: dict[str, bytes]) -> dict[str, bytes]:
    if not files or len(files) > MAX_FILES:
        raise _invalid("skill_file_count_invalid")
    normalized: dict[str, bytes] = {}
    collision_keys: dict[str, str] = {}
    for raw_path, content in files.items():
        path = normalize_skill_path(raw_path)
        if path in normalized:
            raise _invalid("skill_path_collision")
        key = unicodedata.normalize("NFC", full_case_fold_17(unicodedata.normalize("NFC", path)))
        if key in collision_keys:
            raise _invalid("skill_path_collision")
        collision_keys[key] = path
        normalized[path] = content
    paths = set(normalized)
    for path in paths:
        parts = path.split("/")
        for index in range(1, len(parts)):
            if "/".join(parts[:index]) in paths:
                raise _invalid("skill_path_prefix_collision")
    total = sum(len(content) for content in normalized.values())
    if total > MAX_UNCOMPRESSED_SIZE:
        raise _invalid("skill_uncompressed_too_large")
    skill_md = normalized.get("SKILL.md")
    if skill_md is None or len(skill_md) > MAX_SKILL_MD_SIZE:
        raise _invalid("skill_md_missing_or_too_large")
    return normalized


def content_manifest_sha256(files: dict[str, bytes]) -> str:
    normalized = validate_skill_files(files)
    digest = hashlib.sha256()
    for path in sorted(normalized, key=lambda item: item.encode("utf-8")):
        path_bytes = path.encode("utf-8")
        content = normalized[path]
        digest.update(struct.pack(">Q", len(path_bytes)))
        digest.update(path_bytes)
        digest.update(struct.pack(">Q", len(content)))
        digest.update(content)
    return digest.hexdigest()


def _frontmatter(skill_md_text: str) -> tuple[str, str]:
    lines = skill_md_text.splitlines()
    if len(lines) < 3 or lines[0].strip() != "---":
        raise _invalid("skill_frontmatter_invalid")
    try:
        end = next(index for index, value in enumerate(lines[1:], start=1) if value.strip() == "---")
        loaded = yaml.safe_load("\n".join(lines[1:end]))
    except (StopIteration, yaml.YAMLError) as exc:
        raise _invalid("skill_frontmatter_invalid") from exc
    if not isinstance(loaded, dict):
        raise _invalid("skill_frontmatter_invalid")
    name = loaded.get("name")
    description = loaded.get("description", "")
    if not isinstance(name, str) or not (1 <= len(name.strip()) <= 100) or not isinstance(description, str):
        raise _invalid("skill_frontmatter_invalid")
    return name.strip(), description[:1000]


def _normalized_zip(files: dict[str, bytes]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(files, key=lambda item: item.encode("utf-8")):
            info = zipfile.ZipInfo(path, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            archive.writestr(info, files[path])
    return output.getvalue()


def prepare_skill_archive(filename: str, source: bytes) -> PreparedSkillPackage:
    if not filename.lower().endswith((".zip", ".skill")) or len(source) > MAX_ARCHIVE_SIZE:
        raise _invalid("skill_archive_invalid")
    files: dict[str, bytes] = {}
    try:
        with zipfile.ZipFile(io.BytesIO(source)) as archive:
            infos = archive.infolist()
            if len([item for item in infos if not item.is_dir()]) > MAX_FILES:
                raise _invalid("skill_file_count_invalid")
            declared_total = 0
            for info in infos:
                if info.flag_bits & 0x1:
                    raise _invalid("skill_encrypted_entry")
                mode = (info.external_attr >> 16) & 0o170000
                if mode not in {0, stat.S_IFREG, stat.S_IFDIR}:
                    raise _invalid("skill_special_file")
                if info.is_dir():
                    continue
                path = normalize_skill_path(info.filename)
                if path in files:
                    raise _invalid("skill_path_collision")
                declared_total += info.file_size
                if declared_total > MAX_UNCOMPRESSED_SIZE:
                    raise _invalid("skill_uncompressed_too_large")
                content = archive.read(info)
                files[path] = content
    except (zipfile.BadZipFile, RuntimeError) as exc:
        if isinstance(exc, APIException):
            raise
        raise _invalid("skill_archive_invalid") from exc
    files = validate_skill_files(files)
    try:
        skill_md_text = files["SKILL.md"].decode("utf-8")
    except UnicodeDecodeError as exc:
        raise _invalid("skill_md_not_utf8") from exc
    name, description = _frontmatter(skill_md_text)
    digest = content_manifest_sha256(files)
    normalized_package = _normalized_zip(files)
    return PreparedSkillPackage(
        name=name,
        description=description,
        skill_md_text=skill_md_text,
        files=files,
        content_sha256=digest,
        normalized_package=normalized_package,
        source_compressed_size=len(source),
        uncompressed_size=sum(len(item) for item in files.values()),
        validation_summary={
            "valid": True,
            "file_paths": sorted(files),
            "unicode_case_folding": "17.0.0",
            "case_folding_sha256": CASE_FOLDING_SHA256,
        },
    )


def prepare_skill_editor_version(files: dict[str, bytes], skill_md_text: str) -> PreparedSkillPackage:
    updated = dict(files)
    updated["SKILL.md"] = skill_md_text.encode()
    updated = validate_skill_files(updated)
    name, description = _frontmatter(skill_md_text)
    digest = content_manifest_sha256(updated)
    package = _normalized_zip(updated)
    return PreparedSkillPackage(
        name=name,
        description=description,
        skill_md_text=skill_md_text,
        files=updated,
        content_sha256=digest,
        normalized_package=package,
        source_compressed_size=None,
        uncompressed_size=sum(len(item) for item in updated.values()),
        validation_summary={
            "valid": True,
            "file_paths": sorted(updated),
            "unicode_case_folding": "17.0.0",
            "case_folding_sha256": CASE_FOLDING_SHA256,
        },
    )


def _invalid(reason: str) -> APIException:
    return APIException(
        status_code=422,
        code=ErrorCode.VALIDATION_ERROR,
        msg=ErrorMessage.VALIDATION_ERROR,
        data={"reason": reason},
    )
