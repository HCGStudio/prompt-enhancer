# PromptEnhancer

> 把一句话的"vibe coding"想法,转换成可以直接喂给 Claude Code、Codex、Cursor 等编码 Agent 的高质量结构化 Prompt。

`prompt-enhancer` 是一个轻量交互式 CLI:你给它一句简单的需求(比如 *"做一个 todo app"*),它会在终端里通过 Claude-Code 风格的选择框问你 1–4 个关键问题,然后流式输出一份结构完整的 Prompt(目标 / 上下文 / 功能需求 / 非功能需求 / 交付物 / 不在范围内 / 验收标准)。

它还会自动读取当前目录下的 `CLAUDE.md`、`AGENTS.md`、`.cursorrules` 等约定文件,把项目惯例直接融入到输出 Prompt 中,无需你手动重复说明。

> English version: [README.md](./README.md)

---

## 安装 / 运行

最快的方式是用 `npx`,无需安装:

```bash
export PROMPT_ENHANCER_BASE_URL="https://api.openai.com/v1"
export PROMPT_ENHANCER_AUTH_TOKEN="sk-..."

npx @hcgstudio/prompt-enhancer "做一个 todo app"
```

或者全局安装:

```bash
npm install -g @hcgstudio/prompt-enhancer
prompt-enhancer "写个抓 GitHub star 数的 CLI"
```

### 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `PROMPT_ENHANCER_BASE_URL` | 是 | 兼容 OpenAI 协议的接口地址(OpenAI、Azure、OpenRouter、vLLM、Ollama 等都可以) |
| `PROMPT_ENHANCER_AUTH_TOKEN` | 是 | 对应接口的 API Key |
| `PROMPT_ENHANCER_MODEL` | 否 | 默认模型(可被 `-m` 覆盖),默认 `gpt-4o` |

### 命令行参数

- `-m, --model <name>` — 本次调用使用的模型
- `--max-tokens <n>` — 单次响应的最大 token 数(默认 `16000`)

### 使用模式

```bash
# 直接传入 prompt
prompt-enhancer "做一个 todo app"

# 交互式输入
prompt-enhancer

# 临时换个模型
prompt-enhancer -m gpt-4.1 "把这个服务用 Go 重写一遍"
```

---

## 真实示例

**输入:**

```bash
$ npx @hcgstudio/prompt-enhancer "做一个 todo app"
```

**CLI 在终端里弹出选择框:**

```
? Todo app 用什么技术栈?
❯ Next.js + TypeScript + Tailwind (Web)
  Vite + React + TypeScript (Web SPA)
  SwiftUI (iOS)
  Node.js CLI
  Other

? 数据怎么持久化?
❯ LocalStorage(无后端)
  SQLite + Prisma
  Postgres + Prisma
  Other

? 范围?
❯ MVP — 单用户,无需登录
  生产级 — 多用户带鉴权
```

**CLI 流式输出最终的增强 Prompt:**

```markdown
─── Enhanced Prompt ───
你将构建一个单用户的 Todo Web 应用 MVP。无需后端,无需鉴权,数据只存在浏览器中。

## 目标
交付一个小而精的 Todo 应用,开发者可以一条命令本地运行,并能以静态导出方式部署到 Vercel。
针对编码 Agent 的"一次成功"做了优化。

## 技术栈与约束
- Next.js 15(App Router)+ TypeScript(strict)
- Tailwind CSS 用于样式,不引入组件库
- 使用 `localStorage`,key 为 `prompt-enhancer.todos.v1`
- Node 20+,npm

## 功能需求
- 输入框 + 回车添加 Todo,自动 trim,空字符串忽略
- 点击行切换完成状态,完成项加删除线
- 鼠标 hover 行时显示删除图标
- 顶部 Tab 切换 全部 / 进行中 / 已完成,每个 Tab 显示对应数量
- "清除已完成"按钮,无已完成项时禁用
- 每次变更都持久化;挂载时反序列化并做 JSON Schema 校验,异常数据静默丢弃

## 非功能需求
- 首屏不闪烁 — 在 hydration 期间渲染空列表骨架
- 全键盘可用:focus ring 可见,Enter 添加,Esc 清空输入
- 所有交互元素带 aria-label
- 默认页 Lighthouse 可访问性分数 ≥ 95

## 交付物
- `app/page.tsx`、`app/layout.tsx`、`app/globals.css`
- `lib/storage.ts` — 带 Schema 校验的强类型 load/save 工具
- `components/TodoList.tsx`、`components/TodoItem.tsx`、`components/Filters.tsx`
- `README.md`,包含 `npm install && npm run dev` 启动说明
- 一个 Playwright 用例:添加 → 切换 → 筛选 → 刷新后状态保留

## 不在范围内
- 鉴权、多用户、跨设备同步
- 拖拽排序
- 暗色模式开关(只跟随 `prefers-color-scheme`)
- 任何后端或数据库

## 验收标准
- `npm run dev` 启动无 warning,根路径 `/` 可正常加载
- 所有功能需求通过手工冒烟
- Playwright 用例在 CI 中通过
- 刷新后 Todo 列表与完成状态保留
───────────────────────
```

把这段直接贴给 Claude Code / Codex / Cursor,让它去实现即可。

---

## 工作原理

1. CLI 把你的原始 Prompt 发给配置好的 chat completions 接口,系统提示词告诉模型扮演 Prompt 增强器。
2. 模型可以调用两个工具:
   - `read_ai_instructions` — 读取当前目录下的 `CLAUDE.md` / `AGENTS.md` / `.cursorrules` 等,获取项目惯例。
   - `ask_question` — 在你的终端弹出交互选择框,问最关键的问题(最多 1–4 个)。
3. 澄清完成后,模型把最终增强 Prompt 以 Markdown 形式流式输出到 stdout。

整个流程在你的终端里完成,数据只发往你自己配置的 LLM 接口。

---

## 开发

```bash
git clone https://github.com/hcgstudio/prompt-enhancer
cd prompt-enhancer
npm install
npm run dev -- "测试 prompt"     # 用 tsx 直接跑 src
npm run build                    # 编译到 dist/
```

## 发布

打 tag 后由 GitHub Actions(`.github/workflows/publish.yml`)自动发布到 npm:

```bash
npm version patch && git push --follow-tags
```

## License

[MIT](./LICENSE) © HCGStudio
