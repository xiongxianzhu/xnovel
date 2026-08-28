# xnovel API 文档

> 文档状态：Draft
>
> 文档版本：0.9.0
>
> 最后更新：2026-08-21
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
| `11004` | `INVALID_CREDENTIALS`            | `401`     | 登录标识或密码无效       |
| `11005` | `LOGIN_RATE_LIMITED`             | `429`     | 登录固定窗口已超限       |
| `11006` | `SESSION_INVALID`                | `401`     | 会话无效、过期或已撤销   |
| `11007` | `CURRENT_PASSWORD_INVALID`       | `422`     | 当前密码不正确           |
| `12001` | `MEDIA_INVALID`                  | `422`     | 图片格式、内容或地址无效 |
| `12002` | `MEDIA_TOO_LARGE`                | `413`     | 上传图片超过 5 MiB       |

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

> 检查管理 API 路由。Access Token 必须有效、会话未撤销、用户处于启用状态且角色为 `admin`。

#### Header 参数

| 参数            | 类型   | 必填 | 默认值 | 说明                    |
| --------------- | ------ | ---- | ------ | ----------------------- |
| `Authorization` | string | 是   | -      | `Bearer <access_token>` |

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
curl -H "Authorization: Bearer ACCESS_TOKEN" http://127.0.0.1:8000/api/admin/v1/health
# Output: {"code":0,"msg":"SUCCESS","data":{"status":"ok"}}
```

缺少或无效 Bearer 返回 `10002`；会话过期或撤销返回 `11006`。两种 HTTP `401` 都包含 `WWW-Authenticate: Bearer`。有效普通用户访问返回 HTTP `403 / 10003`，认证数据库不可用返回 HTTP `503 / 10007`。

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
| `email`      | string | 否   | `null` | 有效邮箱；保存前去除首尾空格并转为小写     |
| `password`   | string | 是   | -      | `8`–`128` 位；新密码需满足四类字符中的至少三类 |
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

## 8. 认证、资料与媒体

T-107 已实现以下端点。所有受保护请求使用 `Authorization: Bearer <access_token>`。

### 8.1 认证与会话

| 方法   | 路径                   | 上行参数                                                             | 成功 `data`                                                                                                  | 主要失败                  | 行为                                                                        |
| ------ | ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------- | --------------------------------------------------------------------------- |
| `POST` | `/api/v1/auth/login`   | JSON：`identifier: string`、`password: string`                       | `access_token`、`token_type=Bearer`、`expires_at`、`user{id,username,email,phone_e164,nickname,role,status,must_change_password}` | `11004`、`11005`、`10007` | 创建独立会话；设置 Path=`/api/v1`、HttpOnly、SameSite=Lax 的 Refresh Cookie |
| `POST` | `/api/v1/auth/refresh` | Header：`Origin`；配置的 Refresh Cookie，默认 `xnovel_refresh_token` | `access_token`、`token_type=Bearer`、`expires_at`                                                            | `10003`、`11006`、`10007` | 原子轮换 Refresh Token；旧令牌重放撤销会话                                  |
| `POST` | `/api/v1/auth/logout`  | Header：`Origin`；配置的 Refresh Cookie 可缺省                       | `{}`                                                                                                         | `10003`、`10007`          | 幂等撤销当前会话并清除 Cookie                                               |

登录请求示例：

```json
{
  "identifier": "writer@example.com",
  "password": "correct horse battery staple"
}
```

登录成功示例：

```json
{
  "code": 0,
  "msg": "SUCCESS",
  "data": {
    "access_token": "ACCESS_TOKEN",
    "token_type": "Bearer",
    "expires_at": "2026-08-21T12:15:00Z",
    "user": {
      "id": "0198b3d4-95d2-7a31-8ec3-a9c6653fa2f0",
      "username": "writer",
      "email": "writer@example.com",
      "phone_e164": null,
      "nickname": "作者",
      "role": "user",
      "status": "active",
      "must_change_password": false
    }
  }
}
```

- 页面重新加载后，Web 使用刷新 Cookie 获取新的访问令牌；刷新失败或会话失效时进入登录页。访问令牌不得写入 `localStorage`、`sessionStorage` 或 Cookie。
- 登录请求包含 `identifier` 与 `password`。包含 `@` 按邮箱处理，合法 `+` E.164 按手机号处理，其余按用户名处理。
- 邮箱和手机号均可为空；已填写且未验证的邮箱和手机号首版可以登录，不实现验证与找回密码。
- 账号不存在、密码错误或无法识别标识统一返回 `11004`。
- 登录按来源和来源加标识执行固定窗口限流。

认证响应不能返回密码哈希、会话令牌哈希、验证令牌或用户是否存在的探测信息。

### 8.2 用户资料

本人资料响应可以包含：`id`、`username`、`email`、`email_verified_at`、`phone_e164`、`phone_verified_at`、`nickname`、头像来源、`address`、`birthday`、`last_login_at`、`must_change_password`、`created_at` 和 `updated_at`。响应中的 `username` 和 `email` 是数据库保存的规范化值；用户展示名称使用 `nickname`。管理员用户查询不返回 `address`、`birthday`、完整邮箱或完整手机号。

| 方法    | 路径                        | 上行参数                                                                                            | 成功 `data`                                                                                                        | 主要失败                                             | 行为                                     |
| ------- | --------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ---------------------------------------- |
| `GET`   | `/api/v1/users/me`          | Header：`Authorization`                                                                             | `id`、`username`、`email`、验证时间、`phone_e164`、`nickname`、`role`、头像、`address`、`birthday`、状态、首次改密状态和时间字段 | `10002`、`11006`、`10007`                            | 只返回当前用户                           |
| `PATCH` | `/api/v1/users/me`          | JSON 可选：`username`、`email`、`phone_e164`、`nickname`、`address`、`birthday`、`current_password` | 更新后的完整本人资料                                                                                               | `10001`、`10002`、`11002`、`11006`、`11007`、`10007` | 完成首次改密后可用；修改敏感标识必须提交当前密码 |
| `PUT`   | `/api/v1/users/me/password` | JSON：`current_password`、`new_password`；配置的 Refresh Cookie                                     | `access_token`、`token_type=Bearer`、`expires_at`、更新后的 `user`                                                  | `10001`、`10002`、`11006`、`11007`、`10007`          | 撤销其他会话、清除首次改密状态并轮换当前会话令牌 |

首次改密账号在完成密码修改前，作品、偏好、头像等其他受保护业务接口返回 `403 / 10003`，`data.reason` 为 `must_change_password`。

`PATCH` 中显式传入 `phone_e164: null`、`address: null` 或 `birthday: null` 表示清空字段。省略字段表示不修改。

### 8.3 用户偏好

#### 8.3.1 读取当前用户偏好

`GET` `/api/v1/users/me/preferences`

`request headers` 参数：

| 参数            | 类型   | 必填 | 默认值 | 备注                    |
| --------------- | ------ | ---- | ------ | ----------------------- |
| `Authorization` | string | 是   | -      | `Bearer <access_token>` |

下行参数：

| 参数             | 类型   | 默认值             | 备注                                                                          |
| ---------------- | ------ | ------------------ | ----------------------------------------------------------------------------- |
| `code`           | int    | `0`                | 成功响应码                                                                    |
| `msg`            | string | `SUCCESS`          | 稳定消息标识                                                                  |
| `data`           | object | -                  | 完整用户偏好                                                                  |
| `└locale`        | string | `zh-CN`            | `zh-CN`、`zh-TW` 或 `en-US`                                                   |
| `└theme_palette` | string | `manuscript-brown` | `manuscript-brown`、`pine-green`、`harbor-blue`、`grape-purple` 或 `graphite` |
| `└theme_mode`    | string | `system`           | `system`、`light` 或 `dark`                                                   |
| `└created_at`    | string | -                  | UTC ISO 8601 创建时间                                                         |
| `└updated_at`    | string | -                  | UTC ISO 8601 更新时间                                                         |

成功，HTTP `200`：

```json
{
  "code": 0,
  "msg": "SUCCESS",
  "data": {
    "locale": "zh-CN",
    "theme_palette": "manuscript-brown",
    "theme_mode": "system",
    "created_at": "2026-08-21T12:00:00Z",
    "updated_at": "2026-08-21T12:00:00Z"
  }
}
```

失败，HTTP `401`：

```json
{
  "code": 11006,
  "msg": "SESSION_INVALID",
  "data": {}
}
```

该接口还可能返回 `10002 / UNAUTHORIZED` 和 `10007 / SERVICE_UNAVAILABLE`。HTTP `401` 包含 `WWW-Authenticate: Bearer`。

#### 8.3.2 更新当前用户偏好

`PATCH` `/api/v1/users/me/preferences`

> 请求必须至少提交一个字段。省略字段表示不修改；`null` 和未知枚举返回校验失败。

`request headers` 参数：

| 参数            | 类型   | 必填 | 默认值             | 备注                    |
| --------------- | ------ | ---- | ------------------ | ----------------------- |
| `Authorization` | string | 是   | -                  | `Bearer <access_token>` |
| `Content-Type`  | string | 是   | `application/json` | 请求内容类型            |

`request json` 参数：

| 参数            | 类型   | 必填 | 默认值 | 备注                                                                          |
| --------------- | ------ | ---- | ------ | ----------------------------------------------------------------------------- |
| `locale`        | string | 否   | -      | `zh-CN`、`zh-TW` 或 `en-US`                                                   |
| `theme_palette` | string | 否   | -      | `manuscript-brown`、`pine-green`、`harbor-blue`、`grape-purple` 或 `graphite` |
| `theme_mode`    | string | 否   | -      | `system`、`light` 或 `dark`                                                   |

下行参数：

| 参数             | 类型   | 默认值             | 备注                        |
| ---------------- | ------ | ------------------ | --------------------------- |
| `code`           | int    | `0`                | 成功响应码                  |
| `msg`            | string | `SUCCESS`          | 稳定消息标识                |
| `data`           | object | -                  | 更新后的完整偏好            |
| `└locale`        | string | `zh-CN`            | `zh-CN`、`zh-TW` 或 `en-US` |
| `└theme_palette` | string | `manuscript-brown` | 五套主题家族之一            |
| `└theme_mode`    | string | `system`           | `system`、`light` 或 `dark` |
| `└created_at`    | string | -                  | UTC ISO 8601 创建时间       |
| `└updated_at`    | string | -                  | UTC ISO 8601 更新时间       |

成功，HTTP `200`：

```json
{
  "code": 0,
  "msg": "SUCCESS",
  "data": {
    "locale": "en-US",
    "theme_palette": "harbor-blue",
    "theme_mode": "dark",
    "created_at": "2026-08-21T12:00:00Z",
    "updated_at": "2026-08-21T12:10:00Z"
  }
}
```

失败，HTTP `422`：

```json
{
  "code": 10001,
  "msg": "VALIDATION_ERROR",
  "data": {
    "details": []
  }
}
```

该接口还可能返回 `10002 / UNAUTHORIZED`、`11006 / SESSION_INVALID` 和 `10007 / SERVICE_UNAVAILABLE`。HTTP `401` 包含 `WWW-Authenticate: Bearer`。

### 8.4 头像、Logo 与媒体

| 方法     | 路径                               | 上行参数                       | 成功 `data`                        | 主要失败                                             | 缓存与幂等                                           |
| -------- | ---------------------------------- | ------------------------------ | ---------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `POST`   | `/api/v1/users/me/avatar`          | Bearer；multipart `file`       | `source=upload`、`url`             | `10002`、`11006`、`12001`、`12002`、`10007`          | 替换头像，不幂等                                     |
| `PUT`    | `/api/v1/users/me/avatar-url`      | Bearer；JSON `url`             | `source=url`、`url`                | `10002`、`11006`、`12001`、`10007`                   | 同一 URL 可重复设置                                  |
| `DELETE` | `/api/v1/users/me/avatar`          | Bearer                         | `source=none`、`url=null`          | `10002`、`11006`、`10007`                            | 幂等                                                 |
| `GET`    | `/api/v1/site-settings/public`     | 无                             | `registration_enabled`、`logo_url` | `10007`                                              | 可公开读取                                           |
| `GET`    | `/api/v1/media/{storage_key}`      | Path：`storage_key`            | 图片二进制                         | `10004`、`12001`                                     | `Cache-Control: public, max-age=31536000`；`nosniff` |
| `POST`   | `/api/admin/v1/site-settings/logo` | Admin Bearer；multipart `file` | `url`                              | `10002`、`10003`、`11006`、`12001`、`12002`、`10007` | 替换 Logo，不幂等并写管理员审计                      |
| `DELETE` | `/api/admin/v1/site-settings/logo` | Admin Bearer                   | `url=null`                         | `10002`、`10003`、`11006`、`10007`                   | 幂等并写管理员审计                                   |

- 上传头像和 Web 全局 Logo 使用 `multipart/form-data`，单文件最大 5 MiB；仅接受解码确认的 PNG、JPEG 或 WebP。Logo 只允许管理员修改。
- 上传头像最大宽高为 2048×2048，总像素不超过 4,194,304；Web Logo 最大宽高为 4096×4096，总像素不超过 16,777,216。API 必须实际解码后校验，不能只信任文件头或尺寸声明。
- URL 头像只接受 HTTPS 绝对 URL，并拒绝 userinfo、`localhost`、环回地址和字面量私网 IP。API 不抓取远程文件，也不承诺检查其大小；上传文件与 URL 字段互斥。
- API 不返回存储键、管理员 ID 或服务器路径。

### 8.5 Web Skill

所有普通 Skill 请求都以当前用户为所有权边界。不存在与无权访问对外使用一致的 `404` 行为，避免通过 ID 探测其他用户资源。

管理员普通 Skill 接口只返回名称、所有者标识、状态、大小、文件数、哈希和校验摘要等非内容安全元数据，不得返回 `SKILL.md` 或资源正文。安全事件处置可以把 Skill 设为 `quarantined` 或解除隔离；两种操作都要求管理员身份、稳定原因码、可选脱敏备注和管理员审计事件。隔离立即禁用 Skill，解除隔离只恢复为 `ready`，不会自动启用。

| 方法     | 路径                                           | 用途                              |
| -------- | ---------------------------------------------- | --------------------------------- |
| `GET`    | `/api/v1/skills`                               | 列出当前用户 Skill                |
| `POST`   | `/api/v1/skills`                               | 上传并校验 Skill ZIP              |
| `GET`    | `/api/v1/skills/{skill_id}`                    | 读取当前投影和版本摘要            |
| `PUT`    | `/api/v1/skills/{skill_id}/skill-md`           | 编辑 `SKILL.md` 并创建不可变版本  |
| `PATCH`  | `/api/v1/skills/{skill_id}/enabled`            | 启用或禁用                        |
| `GET`    | `/api/v1/skills/{skill_id}/resource?path=...`  | 读取允许的当前版本文本资源        |
| `DELETE` | `/api/v1/skills/{skill_id}`                    | 删除 Skill 与版本存储             |
| `GET`    | `/api/admin/v1/skills`                         | 管理员读取非内容安全元数据        |
| `POST`   | `/api/admin/v1/skills/{skill_id}/quarantine`   | 隔离并写管理员审计                |
| `POST`   | `/api/admin/v1/skills/{skill_id}/release`      | 解除隔离并写管理员审计            |

- 上传使用 `multipart/form-data`，只接受单个 `.zip` 或 `.skill` 文件；压缩包最大 10 MiB，解压累计最大 50 MiB，最多 500 个文件，`SKILL.md` 最大 1 MiB。
- 列表使用第 4 节页码分页，支持名称搜索和启用状态筛选；默认按 `updated_at DESC, id DESC` 排序。
- 详情返回当前投影、状态、当前版本、文件清单、压缩与解压大小、文件数、内容 SHA-256 和结构化校验摘要，不返回服务器真实路径。
- 编辑请求只提交新的 `skill_md_text` 和客户端持有的 `current_version_id`。成功后生成 `source_kind = editor` 的不可变版本；版本变化返回 `409` 并保留客户端输入。
- 上传新版本必须从已有 Skill 资源发起，不能通过同名普通上传静默覆盖。frontmatter 改名时在同一事务重新检查用户范围唯一性。
- 启用仅允许 `ready` 且当前版本有效的 Skill；禁用立即影响新 AI 任务，不取消已发出的任务。
- 删除需要显式确认，先禁用并进入 `deleting`；清理完成前不能重新启用。历史 AI 任务只保留无外键标量快照。
- 文本资源预览只允许当前版本清单内的 `.md`、`.txt`、`.json`、`.yaml` 和 `.yml`，单文件最大 1 MiB。请求参数不能直接映射到服务器路径。

归档路径、碰撞或压缩预算失败使用 `422`；同用户名称冲突、编辑版本冲突使用 `409`；文件清理失败不把删除响应伪装成完整成功，资源保持 `deleting` 并提供可查询状态。

### 8.6 AI Provider 与模型

Web 使用当前用户自己的 Provider 配置和密钥。内置目录、自定义 Provider、四种协议、模型和默认模型的详细范围见 [`ai-integration.md`](ai-integration.md)。

| 方法   | 路径                                       | 用途                                     |
| ------ | ------------------------------------------ | ---------------------------------------- |
| `GET`  | `/api/v1/ai/providers/catalog`             | 读取 16 个内置 Provider 目录             |
| `GET`  | `/api/v1/ai/providers`                     | 列出当前用户连接                         |
| `POST` | `/api/v1/ai/providers`                     | 创建连接、模型与加密凭据                 |
| `GET`  | `/api/v1/ai/providers/{config_id}`         | 读取非敏感连接详情                       |
| `PUT`  | `/api/v1/ai/providers/{config_id}`         | 更新连接、模型和可选密钥                 |
| `POST` | `/api/v1/ai/providers/{config_id}/test`    | 发起最多 1 token 的连接测试              |

### 8.7 AI 任务与候选

| 方法   | 路径                                  | 用途                                      |
| ------ | ------------------------------------- | ----------------------------------------- |
| `POST` | `/api/v1/ai/tasks`                    | 创建任务并返回 `202`                      |
| `GET`  | `/api/v1/ai/tasks/{task_id}`          | 读取状态、用量、错误和候选                |
| `GET`  | `/api/v1/ai/tasks/{task_id}/events`   | Bearer 鉴权 SSE 状态、增量、用量与终态流  |
| `POST` | `/api/v1/ai/tasks/{task_id}/cancel`   | 幂等请求取消                              |
| `POST` | `/api/v1/ai/results/{result_id}/apply`| 以正文版本锁显式应用候选                  |
| `POST` | `/api/v1/ai/results/{result_id}/reject`| 显式舍弃候选                             |

任务请求只接受当前用户拥有的作品、文档、Provider、模型和明确选择的已启用 Skill。`context_manifest` 只保存范围、版本和哈希等标量快照，不返回完整上下文。应用候选提交目标文档、当前正文版本和最终确认内容；版本变化返回 `409 / 10005`，不会自动覆盖。

- Provider 配置响应只返回非敏感字段、`configured` 和脱敏 `key_hint`，不得提供读取密钥明文的接口。
- 同一用户的 `provider_id` 唯一；内置 ID 是保留字，自定义 ID 创建后不可修改。
- 自定义 Provider 必须选择 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 或 Google Generative AI，不能提交任意请求模板或 Header。
- 内置云 Provider 按目录要求密钥；只有命中管理员显式允许 Origin 的自定义 Provider 可以无密钥保存，并返回明确警告。
- 一个 Provider 至少包含一个模型和一个同配置默认模型。模型 ID、上下文窗口和最大输出由用户明确提交，API 不根据名称猜测。
- 测试连接由用户显式触发，最多生成 1 token，可能产生少量费用；测试与正式任务共用每用户两个并发槽位。
- 整个调用最长 120 秒，有效输出上限不超过 8,192 tokens。首版不自动重试、不设置日/月配额，也不返回估算费用。
- Provider 未报告的 Token 用量字段保持 `null`。错误响应使用稳定 AI 错误码和脱敏信息，不包含 Header、完整上下文或完整上游响应。

### 8.8 作品

所有作品请求都以当前用户为所有权边界。不存在、已删除或属于其他用户的作品统一返回 `404 / 10004`。

| 方法   | 路径                         | 上行参数                                  | 成功 `data`                                      | 主要失败                  |
| ------ | ---------------------------- | ----------------------------------------- | ------------------------------------------------ | ------------------------- |
| `GET`  | `/api/v1/projects`            | Query：`page`、`page_size`                 | 分页作品摘要                                     | `10002`、`11006`、`10007` |
| `POST` | `/api/v1/projects`            | JSON：`title: string`，长度 `1`–`200`     | 作品摘要与自动创建的“未命名文档”元数据           | `10002`、`11006`、`10007` |
| `GET`  | `/api/v1/projects/{project_id}` | Path：作品 UUID                         | 作品详情与初始文档元数据，不返回正文             | `10002`、`10004`、`11006`、`10007` |

作品列表按 `updated_at DESC, id DESC` 排序，默认每页 `20` 条，最大 `100` 条。同一用户可以创建同名作品。创建作品时，`projects`、`documents` 和 `document_contents` 在同一事务中生成；失败时整体回滚。

### 8.9 文档树

所有文档端点先验证当前用户拥有路径中的作品。不存在、已删除、跨作品或跨用户的节点统一返回 `404 / 10004`。

| 方法     | 路径                                                         | 上行参数                                              | 成功 `data`          | 主要失败                           |
| -------- | ------------------------------------------------------------ | ----------------------------------------------------- | -------------------- | ---------------------------------- |
| `GET`    | `/api/v1/projects/{project_id}/documents`                    | Query：`status=active\|archived\|all`，默认 `active` | `{items}` 扁平节点表 | `10002`、`10004`、`11006`、`10007` |
| `POST`   | `/api/v1/projects/{project_id}/documents`                    | `title`、`kind=folder\|manuscript`、`parent_id`       | 新节点摘要           | `10002`、`10004`、`10005`、`10007` |
| `PATCH`  | `/api/v1/projects/{project_id}/documents/{document_id}`      | 至少一个：`title`、`status=active\|archived`          | 更新后节点摘要       | `10002`、`10004`、`10005`、`10007` |
| `POST`   | `/api/v1/projects/{project_id}/documents/reorder`            | 移动节点、目标父级、完整受影响同级组                  | 更新后的活动节点表   | `10002`、`10004`、`10005`、`10007` |
| `DELETE` | `/api/v1/projects/{project_id}/documents/{document_id}`      | Path：作品与节点 UUID                                 | `id`、`deleted=true` | `10002`、`10004`、`10005`、`10007` |

创建正文或大纲时在同一事务生成空 `document_contents`，文件夹不生成正文。父节点必须是同作品中未删除、未归档的文件夹。

排序请求的每个同级组包含 `parent_id` 和移动完成后的有序 `items`；每项携带 `id` 与提交前 `updated_at`。同级排序提交一个组，跨父级移动提交来源与目标两个组。服务端锁定节点、拒绝循环，并验证组完整覆盖当前同级；集合或时间戳不一致返回 `409 / 10005`，`data.reason=tree_changed`。

归档非空文件夹、删除非空文件夹、形成树循环、使用无效父节点，以及归档或删除最后一个当前正文均返回 `409 / 10005`。`data.reason` 分别使用 `folder_not_empty`、`tree_cycle`、`invalid_parent`、`last_active_manuscript`。归档节点可以通过 `PATCH status=active` 恢复并追加到原父级末尾。

### 8.10 正文读取与保存

正文端点只允许当前用户访问自己作品中未删除、未归档的非文件夹节点。文件夹、归档节点、跨作品、跨用户和不存在资源统一返回 `404 / 10004`。

| 方法  | 路径                                                                 | 上行参数                                        | 成功 `data`                                  | 主要失败                                      |
| ----- | -------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------- | --------------------------------------------- |
| `GET` | `/api/v1/projects/{project_id}/documents/{document_id}/content`      | Path：作品与文档 UUID                           | 正文、格式、版本、字数、校验和与时间戳       | `10002`、`10004`、`11006`、`10007`            |
| `PUT` | `/api/v1/projects/{project_id}/documents/{document_id}/content`      | `content`、`content_format=plain_text`、`version` | 保存后的完整正文状态，版本递增               | `10002`、`10004`、`10005`、`11006`、`10007`   |

保存使用请求 `version` 与当前 `document_contents.version` 执行乐观并发控制。版本不一致返回 `409 / 10005`，`data.reason=content_version_conflict`，数据库正文保持不变。客户端确认保留本地版本时必须先读取最新版本，再使用新的版本号重新提交；接口不提供无条件覆盖参数。

服务端统一计算正文 UTF-8 SHA-256 与字数：每个中日韩统一表意文字计一个字，连续 Unicode 字母或数字计一个词，空白和纯标点不计数。保存事务同时更新时间、最近保存用户、文档节点和作品更新时间。正文不得进入异常日志、审计详情或调试快照。

### 8.11 规划、设定、引用与导出

人物、世界设定和正文引用均继承作品所有权。跨用户、跨作品、软删除和不存在资源统一返回 `404 / 10004`。

| 方法     | 路径                                                                         | 用途                         |
| -------- | ---------------------------------------------------------------------------- | ---------------------------- |
| `GET`    | `/api/v1/projects/{project_id}/characters`                                   | 读取稳定排序人物列表         |
| `POST`   | `/api/v1/projects/{project_id}/characters`                                   | 创建人物并追加到末尾         |
| `PATCH`  | `/api/v1/projects/{project_id}/characters/{character_id}`                    | 更新人物资料                 |
| `POST`   | `/api/v1/projects/{project_id}/characters/reorder`                           | 完整集合排序                 |
| `DELETE` | `/api/v1/projects/{project_id}/characters/{character_id}`                    | 软删除人物并移除正文引用     |
| `GET`    | `/api/v1/projects/{project_id}/world-entries`                                | 读取层级世界设定             |
| `POST`   | `/api/v1/projects/{project_id}/world-entries`                                | 创建根级或子设定             |
| `PATCH`  | `/api/v1/projects/{project_id}/world-entries/{entry_id}`                     | 更新设定                     |
| `POST`   | `/api/v1/projects/{project_id}/world-entries/reorder`                        | 同级排序或跨父级移动         |
| `DELETE` | `/api/v1/projects/{project_id}/world-entries/{entry_id}`                     | 软删除空节点并移除正文引用   |
| `GET`    | `/api/v1/projects/{project_id}/documents/{document_id}/references`           | 读取正文显式引用             |
| `PUT`    | `/api/v1/projects/{project_id}/documents/{document_id}/references`           | 完整替换人物与世界设定引用   |
| `GET`    | `/api/v1/projects/{project_id}/export?format=markdown\|plain_text`           | 下载作品正文，默认 Markdown  |

人物别名最多 20 项；`profile` 和 `attributes` 是最多 50 项的字符串键值对象。人物排序与世界设定移动都提交完整受影响集合及各项 `updated_at`，过期集合返回 `409 / 10005` 和 `planning_changed`。世界设定循环返回 `world_entry_cycle`，非空节点删除返回 `world_entry_not_empty`。

正文引用只允许活动 `manuscript`，PUT 字段为唯一的 `character_ids` 与 `world_entry_ids` 完整集合。任一目标不可见时整体返回 `404`，不产生部分更新。

导出在内存中生成 UTF-8 文件，Markdown 默认扩展名 `.md`，纯文本为 `.txt`。只导出活动文件夹与正文，保留树顺序；大纲、笔记和归档节点不进入文件。响应使用安全 `Content-Disposition` 与 `nosniff`，不把正文写入日志或临时文件。

### 8.12 其他尚未实现领域

Desktop 不调用本 HTTP API，也不提供本地 HTTP 端点。renderer 通过安全 preload 使用领域级 IPC；SQLite、只读 Skill、凭据与 Provider 调用由 Electron 主进程持有，契约以 `apps/desktop/src/shared/contracts.ts` 和测试为准。

## 9. 变更记录

| 日期       | 版本  | 变更                                                          |
| ---------- | ----- | ------------------------------------------------------------- |
| 2026-08-28 | 1.4.0 | 实现 Provider、流式 AI 任务、候选决策与 Web 私有 Skill API    |
| 2026-08-28 | 1.3.0 | 实现大纲、人物、世界设定、正文引用和 Markdown/纯文本导出       |
| 2026-08-27 | 1.2.0 | 实现纯文本正文读取、乐观锁保存、服务端字数与冲突响应           |
| 2026-08-27 | 1.1.0 | 实现可排序文档树、归档恢复、完整同级并发校验和节点软删除       |
| 2026-08-22 | 1.0.0 | 实现作品列表、创建、打开和自动创建初始文档                     |
| 2026-08-21 | 0.9.0 | 实现 Web 用户偏好读取与部分更新契约                           |
| 2026-08-21 | 0.8.0 | 实现登录会话、用户资料、头像、媒体读取与 Web 全局 Logo        |
| 2026-08-16 | 0.7.0 | 实现统一响应、公开站点配置、注册、限流与生成客户端契约        |
| 2026-08-16 | 0.6.1 | 用户名与邮箱直接保存并返回规范化值，不再使用重复规范化字段    |
| 2026-08-15 | 0.6.0 | 确认 Web BYOK、内置/自定义 Provider、模型与用量规划契约       |
| 2026-08-15 | 0.5.0 | 明确访问/刷新令牌组合、页面会话恢复和完整 401 OpenAPI 契约    |
| 2026-08-15 | 0.4.0 | 统一 HTTP Bearer 认证，并记录 OpenAPI Axios 客户端生成流程    |
| 2026-08-15 | 0.3.0 | 确认本地账号、资料、媒体、偏好、站点设置和 Web Skill 规划契约 |
| 2026-08-15 | 0.2.0 | 增加统一响应、页码分页和游标分页规则，区分当前行为与目标契约  |
| 2026-08-15 | 0.1.0 | 记录健康检查、当前错误结构和基础契约规则                      |
