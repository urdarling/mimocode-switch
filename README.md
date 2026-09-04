[中文](README.md) | [English](README.en.md) | [版本发布](https://github.com/urdarling/mimocode-switch/releases)

# mimocode 供应商管理工具

带 UI 的 mimocode 第三方供应商管理工具。供应商数据直接读写 mimocode.jsonc,
备注/链接/排序存并行元数据文件 mimocode-ui.json。

## 功能

- 添加 / 编辑 / 复制 / 删除第三方供应商(OpenAI 兼容端点)
- 「获取模型」自动拉取供应商 `/models` 列表
- 设置默认供应商与默认模型(卡片下拉随时切换)
- 模型变体(思考强度)标注与选用:内置目录(mimo 内嵌数据快照)+ 官方变体库双来源,chips 多选,自动携带 `reasoningEffort` 请求参数
- 「变体库」界面维护官方变体条目;模型上下文/输出窗口自动预填、可编辑;条目可一键复制为新起点
- 模型能力声明:输入模态(text/image/audio/video/pdf)与推理(reasoning)三态开关,模型编辑表单与变体库均可配置——不在内置目录的自定义模型由此启用图像识别
- 内置供应商认证管理:查看已登录供应商(auth.json,脱敏展示),一键登出
- 卡片拖拽排序
- 深色/浅色主题切换(默认跟随系统)与中/英文界面切换,偏好存 localStorage

## 环境要求

- [Bun](https://bun.sh)(运行时,唯一依赖)
- mimocode(可选:仅「提取内置目录」脚本需要;运行时不需要)

## 启动

```bash
bun server.ts
```

浏览器打开 http://127.0.0.1:4173(端口可用 `PORT` 环境变量覆盖)。
Windows 也可双击 `start.bat`(自动启动并打开浏览器)。

## 配置路径(与 mimocode 一致)

- `MIMOCODE_HOME` 设置时:`$MIMOCODE_HOME/config`
- 否则:`~/.config/mimocode`(Windows / macOS / Linux 均如此,mimocode 不遵循 `%LOCALAPPDATA%`)

候选文件名按序:`mimocode.jsonc` → `mimocode.json` → `config.json`。

写回前自动备份到 `backups/`(保留最近 10 份)。写回会移除 JSONC 注释并格式化为标准 JSON。

## 数据文件

| 文件 | 说明 |
|------|------|
| `mimocode.jsonc` | 供应商真实配置(密钥等) |
| `mimocode-ui.json`(同目录) | 备注 / 链接 / 排序 |
| `data/variants/mimo.json` | 内置模型目录快照(脚本生成,勿手改) |
| `data/variants/official.json` | 官方变体库(UI「变体库」维护或手编辑) |

## 提取内置目录(可选,mimo 升级后)

```bash
bun run scripts/extract-mimo-catalog.ts
```

自动定位本机 mimo 二进制(`mimo`/`mimo.exe`,支持 `MIMO_BIN` 环境变量指定),
重新生成 `data/variants/mimo.json`。

## 测试

```bash
bun test
```

## 隐私

API Key 等敏感信息只存在于你本机的 mimocode 配置中,本仓库不包含任何密钥;
工具运行时读取的是使用者自己机器上的配置。内置供应商的认证信息(auth.json)
同样只在本机,工具仅做脱敏列表展示(不显示凭证)与登出操作。
