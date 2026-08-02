# mimocode 供应商管理工具

带 UI 的 mimocode 第三方供应商管理工具。供应商数据直接读写 mimocode.jsonc,
备注/链接/排序存并行元数据文件 mimocode-ui.json。

## 使用

1. 双击 `start.bat`(或运行 `bun server.ts`)
2. 浏览器自动打开 http://127.0.0.1:4173
3. 添加/编辑/复制/删除供应商,点「启用」切换激活;切换后重启 mimo 生效

## 配置路径

- `MIMOCODE_HOME` 环境变量优先
- Windows: `%LOCALAPPDATA%\mimocode\mimocode.jsonc`
- macOS/Linux: `~/.config/mimocode/mimocode.jsonc`

写回前自动备份到 `backups/`(保留最近 10 份)。写回会移除注释并格式化为标准 JSON。

## 测试

```bash
bun test
```
