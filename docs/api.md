# xnovel API 文档

> 文档状态：Draft  
> 文档版本：0.7.0  
> 最后更新：2026-08-16  
> 当前行为来源：`apps/api/app` 与 `apps/api/tests`

本文供 xnovel 前后端开发者对接 API。健康检查、站点配置和注册章节描述当前可运行行为；分页章节定义后续列表接口必须采用的契约。

## 1. 基础信息

| 项目          | 当前值                  |
| ------------- | ----------------------- |
| 本地地址      | `http://127.0.0.1:8000` |
| 用户 API 前缀 | `/api/v1`               |
| 管理 API 前缀 | `/api/admin/v1`         |
| OpenAPI       | `/docs`                 |
| 内容类型      | `application/json`      |
| 字段命名      | `snake_case`            |

前端通过 `VITE_API_BASE_URL` 设置 API 地址。该变量会进入浏览器构建产物，不能包含密钥。

## 2. 契约状态与兼容策略

当前所有端点都使用统一响应：

```json
{
  "code": 0,
  "msg": "SUCCESS",
  "data": {
    "status": "ok"
  }
}
```

当前异常处理器使用稳定整数错误码和英文消息标识：

```json
{
  "code": 10001,
  "msg": "VALIDATION_ERROR",
  "data": {
    "details": []
  }
}
```

Web 使用 `code` 选择国际化文案，不依赖 `msg` 驱动业务流程。每个稳定错误都在 OpenAPI 中以 `code` 与 `msg` 的字面量响应类型表达；接口已知状态使用对应的精确类型，默认失败响应使用全部稳定错误类型的联合。这样生成的 TypeScript 客户端可以按错误码收窄类型。后端修改响应结构时，必须同步 Schema、异常处理器、OpenAPI、测试和生成客户端。

### 2.1 OpenAPI 与 Web 客户端

FastAPI `create_app().openapi()` 是 Web API 契约来源。`apps/api/scripts/export_openapi.py` 离线导出确定性 JSON，不启动 HTTP Server，也不连接数据库。

```bash
cd apps/web
pnpm api:schema
pnpm api:generate
pnpm api:check
```

输出分别写入 `apps/web/openapi/openapi.json` 和 `apps/web/src/shared/api/generated/`。两个目录都由生成流程维护，不能手工编辑；CI 会拒绝未同步的 Schema 或客户端，包括生成器新增、删除或改变的文件。生成 SDK 不内置默认传输实例，业务调用必须显式传入 `apps/web/src/shared/api/client.ts` 导出的 `apiClient`，确保基地址、Bearer 注入和统一错误处理不会被绕过。

生成器使用 Axios 传输层并启用失败抛出。Web 的手写 API 层只配置基地址、Bearer 令牌和统一错误分类，不重复声明接口响应类型。

## 3. 统一响应规范

新业务接口的成功和失败响应必须包含 `code`、`msg`、`data`，不得省略或改名。

### 3.1 响应字段

| 参数   | 类型         | 必填 | 默认值 | 说明                                      |
| ------ | ------------ | ---- | ------ | ----------------------------------------- |
| `code` | integer      | 是   | -      | 应用响应码；`0` 表示成功，非 `0` 表示失败 |
| `msg`  | string       | 是   | -      | 稳定英文消息标识，不承担最终界面文案      |
| `data` | object/array | 是   | -      | 业务数据；无数据时返回 `{}` 或 `[]`       |

`data` 不得返回 `null`、字符串、数字或布尔值。标量结果必须包装为有名称的对象字段，例如 `{ "count": 12 }`。

### 3.2 应用响应码

| code     | 类型       | 含义         | 使用规则                               |
| -------- | ---------- | ------------ | -------------------------------------- |
| `0`      | 公共响应码 | 成功         | 所有成功响应统一使用                   |
| `-1`     | 公共响应码 | 通用失败     | 仅在没有更具体业务错误码时使用         |
| 其他整数 | 业务错误码 | 具体业务失败 | 在对应接口中稳定定义，不得临时变更含义 |

HTTP 状态码表达协议层结果，`code` 表达应用层结果。失败响应不能通过 HTTP `200` 隐藏认证失败、资源不存在或服务异常。

当前稳定错误码：

| code    | msg                              | 默认 HTTP | 含义                     |
| ------- | -------------------------------- | --------- | ------------------------ |
| `-1`    | `INTERNAL_ERROR`                 | `500`     | 未分类内部错误           |
| `10001` | `VALIDATION_ERROR`               | `422`     | 请求或业务校验失败       |
| `10002` | `UNAUTHORIZED`                   | `401`     | 缺少或无效认证           |
| `10003` | `FORBIDDEN`                      | `403`     | 已认证但无权限           |
| `10004` | `NOT_FOUND`                      | `404`     | 资源不存在               |
| `10005` | `CONFLICT`                       | `409`     | 通用状态或版本冲突       |
| `10006` | `RATE_LIMITED`                   | `429`     | 通用请求限流             |
| `10007` | `SERVICE_UNAVAILABLE`            | `503`     | 数据库或依赖暂时不可用   |
| `11001` | `REGISTRATION_DISABLED`          | `403`     | 公开注册已关闭           |
| `11002` | `ACCOUNT_IDENTIFIER_UNAVAILABLE` | `409`     | 一个或多个账户标识已占用 |
| `11003` | `REGISTRATION_RATE_LIMITED`      | `429`     | 注册固定窗口已超限       |

### 3.3 成功响应

有对象数据：

```json
{
  "code": 0,
  "msg": "SUCCESS",
  "data": {
    "id": "01K0EXAMPLE"
  }
}
```

无业务数据：

```json
{
  "code": 0,
  "msg": "SUCCESS",
  "data": {}
}
```

空列表：

```json
{
  "code": 0,
  "msg": "SUCCESS",
  "data": []
}
```

### 3.4 失败响应

通用失败：

```json
{
  "code": -1,
  "msg": "INTERNAL_ERROR",
  "data": {}
}
```

参数校验失败时，错误项放入 `data.details`，且不得回显原始密码等输入值：

```json
{
  "code": 10001,
  "msg": "VALIDATION_ERROR",
  "data": {
    "details": [
      {
        "type": "less_than_equal",
        "loc": ["query", "page_size"],
        "msg": "Input should be less than or equal to 100"
      }
    ]
  }
}
```

已定义业务错误码时，使用该错误码，不得用 `-1` 代替。客户端根据 `code` 判断错误类型，并把 `msg` 作为诊断标识。

### 3.5 HTTP 状态码

| HTTP 状态         | 场景                   | 客户端处理                   |
| ----------------- | ---------------------- | ---------------------------- |
| `200`             | 查询、更新或删除成功   | 读取 `data`                  |
| `201`             | 资源创建成功           | 读取新资源或标识             |
| `400`             | 请求格式或参数错误     | 展示字段或页面级错误         |
| `401`             | 未登录、凭证缺失或失效 | 进入重新认证流程             |
| `403`             | 已认证但无权限         | 展示无权限状态，不自动重试   |
| `404`             | 资源不存在             | 展示不存在或已删除状态       |
| `409`             | 版本冲突或重复操作     | 提示刷新、合并或取消         |
| `422`             | 请求或业务校验失败     | 展示可操作的校验原因         |
| `429`             | 请求过多               | 遵循 `Retry-After`，限制重试 |
| `500/502/503/504` | 服务或依赖异常         | 展示通用错误，只重试安全请求 |

## 4. 分页响应规范

列表接口默认使用从 `1` 开始的页码分页。所有页码分页端点使用相同的请求和响应字段。

### 4.1 Query 参数

| 参数        | 类型    | 必填 | 默认值 | 说明                           |
| ----------- | ------- | ---- | ------ | ------------------------------ |
| `page`      | integer | 否   | `1`    | 当前页码，最小值为 `1`         |
| `page_size` | integer | 否   | `20`   | 每页数量，取值范围为 `1`–`100` |

筛选与排序字段由具体端点逐项定义。不得用未声明的通用参数接收任意字段名。

### 4.2 `data` 字段

| 参数        | 类型    | 必填 | 默认值 | 说明                                      |
| ----------- | ------- | ---- | ------ | ----------------------------------------- |
| `items`     | array   | 是   | `[]`   | 当前页记录列表                            |
| `page`      | integer | 是   | -      | 当前页码，与有效请求页码一致              |
| `page_size` | integer | 是   | -      | 实际采用的每页数量                        |
| `total`     | integer | 是   | `0`    | 符合当前筛选条件的记录总数                |
| `pages`     | integer | 是   | `0`    | 总页数；按 `ceil(total / page_size)` 计算 |

分页字段必须位于统一响应的 `data` 对象中，不能放在顶层或响应头中。

### 4.3 分页成功示例

```json
{
  "code": 0,
  "msg": "SUCCESS",
  "data": {
    "items": [
      {
        "id": "01K0EXAMPLE",
        "title": "示例作品"
      }
    ],
    "page": 1,
    "page_size": 20,
    "total": 1,
    "pages": 1
  }
}
```

没有符合条件的记录时：

```json
{
  "code": 0,
  "msg": "SUCCESS",
  "data": {
    "items": [],
    "page": 1,
    "page_size": 20,
    "total": 0,
    "pages": 0
  }
}
```

### 4.4 边界与错误

- `page < 1` 或 `page_size` 超出 `1`–`100` 时返回 HTTP `422`。
- 请求页码超过最后一页时返回成功空列表，保留请求的 `page`，不自动改写为最后一页。
- `total` 始终表示应用全部筛选条件后的总数，不是当前页数量。
- `pages` 由服务端计算；客户端不得根据 `items.length` 推断总页数。
- 分页查询应采用稳定排序。具体端点必须声明默认排序字段和可排序字段。

分页参数失败示例：

```json
{
  "code": 10001,
  "msg": "VALIDATION_ERROR",
  "data": {
    "details": [
      {
        "type": "greater_than_equal",
        "loc": ["query", "page"],
        "msg": "Input should be greater than or equal to 1"
      }
    ]
  }
}
```

### 4.5 游标分页

只有在数据规模或实时写入导致页码分页不稳定时才采用游标分页。游标分页的 `data` 必须使用以下字段，并删除 `page`、`page_size`、`total`、`pages`：

| 参数          | 类型    | 必填 | 默认值  | 说明                                 |
| ------------- | ------- | ---- | ------- | ------------------------------------ |
| `items`       | array   | 是   | `[]`    | 当前批次记录列表                     |
| `next_cursor` | string  | 是   | `""`    | 下一批游标；没有后续数据时为空字符串 |
| `has_more`    | boolean | 是   | `false` | 是否还有后续数据                     |

## 5. 当前健康检查

本节记录当前代码的真实行为。两个健康检查都使用第 3 节统一响应。

### 5.1 用户 API 健康检查

`GET` `/api/v1/health`

> 检查用户 API 进程是否可以响应，无需认证。

#### 上行参数

Path、Query、Header 和 Request JSON 参数均无。

#### 下行参数

| 参数      | 类型   | 默认值    | 说明                   |
| --------- | ------ | --------- | ---------------------- |
| `code`    | int    | `0`       | 成功响应码             |
| `msg`     | string | `SUCCESS` | 成功消息标识           |
| `data`    | object | -         | 健康数据               |
| `└status` | string | `"ok"`    | 进程可响应时的固定状态 |

成功，HTTP `200`：

```json
{
  "code": 0,
  "msg": "SUCCESS",
  "data": {
    "status": "ok"
  }
}
```

调用示例：

```bash
curl http://127.0.0.1:8000/api/v1/health
# Output: {"code":0,"msg":"SUCCESS","data":{"status":"ok"}}
```

该端点没有业务失败分支。进程或网络不可用时，请求可能无法获得 JSON 响应。

### 5.2 管理 API 健康检查

`GET` `/api/admin/v1/health`

> 检查管理 API 路由。当前只验证请求是否包含结构正确且非空的 HTTP Bearer 凭证，这是开发期占位逻辑，不能用于生产认证。

#### Header 参数

| 参数            | 类型   | 必填 | 默认值 | 说明                                          |
| --------------- | ------ | ---- | ------ | --------------------------------------------- |
| `Authorization` | string | 是   | -      | `Bearer <access_token>`；当前不校验令牌具体值 |

Path、Query 和 Request JSON 参数均无。

#### 下行参数

成功响应：

| 参数      | 类型   | 默认值    | 说明                   |
| --------- | ------ | --------- | ---------------------- |
| `code`    | int    | `0`       | 成功响应码             |
| `msg`     | string | `SUCCESS` | 成功消息标识           |
| `data`    | object | -         | 健康数据               |
| `└status` | string | `"ok"`    | 路由可响应时的固定状态 |

成功，HTTP `200`：

```json
{
  "code": 0,
  "msg": "SUCCESS",
  "data": {
    "status": "ok"
  }
}
```

调用示例：

```bash
curl -H "Authorization: Bearer development-only" http://127.0.0.1:8000/api/admin/v1/health
# Output: {"code":0,"msg":"SUCCESS","data":{"status":"ok"}}
```

缺少请求头、使用非 Bearer Scheme 或 Bearer 凭证为空时，返回 HTTP `401`，并包含 `WWW-Authenticate: Bearer`：

```json
{
  "code": 10002,
  "msg": "UNAUTHORIZED",
  "data": {}
}
```

## 6. 当前公开注册接口

### 6.1 读取站点配置

`GET` `/api/v1/site-config`

> 公开读取动态注册开关。数据库中缺少固定单例时按关闭返回。

Path、Query、Header 和 Request JSON 参数均无。

下行参数：

| 参数                    | 类型    | 默认值  | 备注             |
| ----------------------- | ------- | ------- | ---------------- |
| `code`                  | int     | `0`     | 成功响应码       |
| `msg`                   | string  | -       | `SUCCESS`        |
| `data`                  | object  | -       | 公开站点配置     |
| `└registration_enabled` | boolean | `false` | 是否允许公开注册 |

成功，HTTP `200`：

```json
{
  "code": 0,
  "msg": "SUCCESS",
  "data": {
    "registration_enabled": false
  }
}
```

调用示例：

```bash
curl http://127.0.0.1:8000/api/v1/site-config
# Output: {"code":0,"msg":"SUCCESS","data":{"registration_enabled":false}}
```

数据库不可用时返回 HTTP `503`：

```json
{
  "code": 10007,
  "msg": "SERVICE_UNAVAILABLE",
  "data": {}
}
```

### 6.2 注册普通用户

`POST` `/api/v1/auth/register`

> 注册开关必须开启。成功后只创建普通用户和默认偏好，不签发访问令牌。

`request headers` 参数：

| 参数           | 类型   | 必填 | 默认值             | 备注         |
| -------------- | ------ | ---- | ------------------ | ------------ |
| `Content-Type` | string | 是   | `application/json` | 请求内容类型 |

`request json` 参数：

| 参数         | 类型   | 必填 | 默认值 | 备注                                       |
| ------------ | ------ | ---- | ------ | ------------------------------------------ |
| `username`   | string | 是   | -      | 规范化后长度 `3`–`32`                      |
| `email`      | string | 是   | -      | 有效邮箱；保存前去除首尾空格并转为小写     |
| `password`   | string | 是   | -      | `12`–`128` 个 Unicode 字符；不裁剪或规范化 |
| `nickname`   | string | 是   | -      | 展示昵称，长度 `1`–`100`                   |
| `phone_e164` | string | 否   | `null` | 带 `+` 和国家码的规范 E.164 手机号         |

下行参数：

| 参数          | 类型        | 默认值   | 备注                         |
| ------------- | ----------- | -------- | ---------------------------- |
| `code`        | int         | `0`      | 成功响应码                   |
| `msg`         | string      | -        | `SUCCESS`                    |
| `data`        | object      | -        | 新用户摘要                   |
| `└id`         | string      | -        | UUID v7                      |
| `└username`   | string      | -        | NFKC 与大小写折叠后的值      |
| `└email`      | string      | -        | 去除首尾空格并转为小写后的值 |
| `└phone_e164` | string/null | `null`   | 规范 E.164 手机号            |
| `└nickname`   | string      | -        | 展示昵称                     |
| `└role`       | string      | `user`   | 固定为 `user`                |
| `└status`     | string      | `active` | 固定为 `active`              |
| `└created_at` | string      | -        | UTC ISO 8601 创建时间        |
| `└updated_at` | string      | -        | UTC ISO 8601 更新时间        |

成功，HTTP `201`：

```json
{
  "code": 0,
  "msg": "SUCCESS",
  "data": {
    "id": "0198b3d4-95d2-7a31-8ec3-a9c6653fa2f0",
    "username": "writer",
    "email": "writer@example.com",
    "phone_e164": null,
    "nickname": "作者",
    "role": "user",
    "status": "active",
    "created_at": "2026-08-16T02:00:00Z",
    "updated_at": "2026-08-16T02:00:00Z"
  }
}
```

失败：

| HTTP  | code    | msg                              | 客户端处理                         |
| ----- | ------- | -------------------------------- | ---------------------------------- |
| `403` | `11001` | `REGISTRATION_DISABLED`          | 隐藏注册入口并返回登录页           |
| `409` | `11002` | `ACCOUNT_IDENTIFIER_UNAVAILABLE` | 不指出冲突的是用户名、邮箱或手机号 |
| `422` | `10001` | `VALIDATION_ERROR`               | 根据 `data.details` 标记字段       |
| `429` | `11003` | `REGISTRATION_RATE_LIMITED`      | 按 `Retry-After` 延迟再次提交      |
| `503` | `10007` | `SERVICE_UNAVAILABLE`            | 保留输入并允许稍后重试             |

注册关闭示例：

```json
{
  "code": 11001,
  "msg": "REGISTRATION_DISABLED",
  "data": {}
}
```

限流响应同时返回 `Retry-After` Header 和 `data.retry_after_seconds`。服务端对来源地址执行 `10` 次/10 分钟限制，对来源地址与规范化用户名、邮箱组合执行 `3` 次/10 分钟限制。

## 7. 新接口文档要求

每个新端点必须独立记录以下内容，不得使用“同上”省略：

- HTTP 方法、完整路径、业务目的和副作用。
- 登录要求、权限标识和数据范围。
- Path、Query、Header 和 Request JSON 的全部参数。
- Response JSON 的全部字段、类型、可空性和生命周期。
- 成功示例、失败示例、HTTP 状态与稳定业务错误码。
- 缓存、幂等性、并发冲突和重试规则。
- 分页端点的默认排序、可排序字段与筛选语义。

请求与响应字段统一使用 `snake_case`。浏览器不能直接调用模型供应商 API，也不能持有模型供应商密钥。

## 8. 已确认但尚未实现的契约

以下内容是实现约束，不代表路由已经存在。具体 HTTP 方法、路径和稳定整数业务错误码必须随 FastAPI 路由、OpenAPI 与测试在同一次变更中补充，不能在代码之前虚构。

### 8.1 认证与会话

- Web 使用服务端可撤销的不透明访问/刷新令牌组合。短期访问令牌由登录或刷新响应返回，只保存在浏览器内存，并通过 `Authorization: Bearer <access_token>` 发送；管理接口不使用独立请求头。
- 长期刷新令牌只保存在 `HttpOnly`、`Secure`、`SameSite=Lax` Cookie 中，不暴露给 JavaScript。刷新接口校验可信 `Origin` 与 CSRF 令牌，并在成功后轮换刷新令牌。
- 页面重新加载后，Web 使用刷新 Cookie 获取新的访问令牌；刷新失败或会话失效时进入登录页。访问令牌不得写入 `localStorage`、`sessionStorage` 或 Cookie。
- 登录请求包含 `identifier` 与 `password`。包含 `@` 按邮箱处理，合法 `+` E.164 按手机号处理，其余按用户名处理。
- 邮箱和手机号只有验证后才可用于登录或找回密码；用户名在邮箱未验证时仍可登录。
- 账号不存在、密码错误或无法识别标识统一返回相同错误。只有密码校验成功后才可提示邮箱或手机号未验证。
- 登录、验证和找回密码后续仍须增加独立限流。登出、密码修改、用户禁用和管理员撤销会话后，同一会话的访问令牌与刷新令牌立即失效。

认证响应不能返回密码哈希、会话令牌哈希、验证令牌或用户是否存在的探测信息。

### 8.2 用户资料、媒体与偏好

本人资料响应可以包含：`id`、`username`、`email`、`email_verified_at`、`phone_e164`、`phone_verified_at`、`nickname`、头像来源、`address`、`birthday`、`last_login_at`、`created_at` 和 `updated_at`。响应中的 `username` 和 `email` 是数据库保存的规范化值；用户展示名称使用 `nickname`。管理员用户查询不返回 `address`、`birthday`、完整邮箱或完整手机号。

- 普通资料更新只接受 `nickname`、头像、`address` 和 `birthday`；邮箱、手机号和密码使用独立高强度流程并要求重新认证。
- 上传头像和 Web 全局 Logo 使用 `multipart/form-data`，单文件最大 5 MiB；仅接受解码确认的 PNG、JPEG 或 WebP。Logo 只允许管理员修改。
- 上传头像最大宽高为 2048×2048，总像素不超过 4,194,304；Web Logo 最大宽高为 4096×4096，总像素不超过 16,777,216。API 必须实际解码后校验，不能只信任文件头或尺寸声明。
- URL 头像只接受 HTTPS 绝对 URL，并拒绝 userinfo、`localhost`、环回地址和字面量私网 IP。API 不抓取远程文件，也不承诺检查其大小；上传文件与 URL 字段互斥。
- 偏好只接受 `locale`、`theme_palette` 和 `theme_mode`。语言枚举为 `zh-CN`、`zh-TW`、`en-US`；主题家族为五套已确认标识；模式为 `system`、`light`、`dark`。
- T-107 增加 Logo 后，公开站点配置可以返回其可访问表示，但仍不返回存储键、管理员 ID 或服务器路径。

### 8.3 Web Skill

所有普通 Skill 请求都以当前用户为所有权边界。不存在与无权访问对外使用一致的 `404` 行为，避免通过 ID 探测其他用户资源。

管理员普通 Skill 接口只返回名称、所有者标识、状态、大小、文件数、哈希和校验摘要等非内容安全元数据，不得返回 `SKILL.md` 或资源正文。安全事件处置可以把 Skill 设为 `quarantined` 或解除隔离；两种操作都要求管理员身份、稳定原因码、可选脱敏备注和管理员审计事件。隔离立即禁用 Skill，解除隔离只恢复为 `ready`，不会自动启用。

- 上传使用 `multipart/form-data`，只接受单个 `.zip` 或 `.skill` 文件；压缩包最大 10 MiB，解压累计最大 50 MiB，最多 500 个文件，`SKILL.md` 最大 1 MiB。
- 列表使用第 4 节页码分页，支持名称搜索和启用状态筛选；默认按 `updated_at DESC, id DESC` 排序。
- 详情返回当前投影、状态、当前版本、文件清单、压缩与解压大小、文件数、内容 SHA-256 和结构化校验摘要，不返回服务器真实路径。
- 编辑请求只提交新的 `skill_md_text` 和客户端持有的 `current_version_id`。成功后生成 `source_kind = editor` 的不可变版本；版本变化返回 `409` 并保留客户端输入。
- 上传新版本必须从已有 Skill 资源发起，不能通过同名普通上传静默覆盖。frontmatter 改名时在同一事务重新检查用户范围唯一性。
- 启用仅允许 `ready` 且当前版本有效的 Skill；禁用立即影响新 AI 任务，不取消已发出的任务。
- 删除需要显式确认，先禁用并进入 `deleting`；清理完成前不能重新启用。历史 AI 任务只保留无外键标量快照。
- 文本资源预览只允许当前版本清单内的 `.md`、`.txt`、`.json`、`.yaml` 和 `.yml`，单文件最大 1 MiB。请求参数不能直接映射到服务器路径。

归档路径、碰撞或压缩预算失败使用 `422`；同用户名称冲突、编辑版本冲突使用 `409`；文件清理失败不把删除响应伪装成完整成功，资源保持 `deleting` 并提供可查询状态。

### 8.4 AI Provider 与模型

Web 使用当前用户自己的 Provider 配置和密钥。内置目录、自定义 Provider、四种协议、模型和默认模型的详细范围见 [`ai-integration.md`](ai-integration.md)。具体 HTTP 方法和路径随 T-401 的 FastAPI 路由与 OpenAPI 一起确定，本节不预先虚构端点。

- Provider 配置响应只返回非敏感字段、`configured` 和脱敏 `key_hint`，不得提供读取密钥明文的接口。
- 同一用户的 `provider_id` 唯一；内置 ID 是保留字，自定义 ID 创建后不可修改。
- 自定义 Provider 必须选择 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 或 Google Generative AI，不能提交任意请求模板或 Header。
- 内置云 Provider 按目录要求密钥；只有命中管理员显式允许 Origin 的自定义 Provider 可以无密钥保存，并返回明确警告。
- 一个 Provider 至少包含一个模型和一个同配置默认模型。模型 ID、上下文窗口和最大输出由用户明确提交，API 不根据名称猜测。
- 测试连接由用户显式触发，最多生成 1 token，可能产生少量费用；测试与正式任务共用每用户两个并发槽位。
- 整个调用最长 120 秒，有效输出上限不超过 8,192 tokens。首版不自动重试、不设置日/月配额，也不返回估算费用。
- Provider 未报告的 Token 用量字段保持 `null`。错误响应使用稳定 AI 错误码和脱敏信息，不包含 Header、完整上下文或完整上游响应。

### 8.5 其他尚未实现领域

作品、文档树、正文保存、人物、世界设定、导出和 AI 任务端点同样尚未实现。实现时以代码、OpenAPI 和测试核对本文，并遵守第 6 节的完整记录要求。

## 9. 变更记录

| 日期       | 版本  | 变更                                                          |
| ---------- | ----- | ------------------------------------------------------------- |
| 2026-08-16 | 0.7.0 | 实现统一响应、公开站点配置、注册、限流与生成客户端契约        |
| 2026-08-16 | 0.6.1 | 用户名与邮箱直接保存并返回规范化值，不再使用重复规范化字段    |
| 2026-08-15 | 0.6.0 | 确认 Web BYOK、内置/自定义 Provider、模型与用量规划契约       |
| 2026-08-15 | 0.5.0 | 明确访问/刷新令牌组合、页面会话恢复和完整 401 OpenAPI 契约    |
| 2026-08-15 | 0.4.0 | 统一 HTTP Bearer 认证，并记录 OpenAPI Axios 客户端生成流程    |
| 2026-08-15 | 0.3.0 | 确认本地账号、资料、媒体、偏好、站点设置和 Web Skill 规划契约 |
| 2026-08-15 | 0.2.0 | 增加统一响应、页码分页和游标分页规则，区分当前行为与目标契约  |
| 2026-08-15 | 0.1.0 | 记录健康检查、当前错误结构和基础契约规则                      |
