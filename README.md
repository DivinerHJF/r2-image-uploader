# R2 Image Uploader

一个移动端优先的个人 Cloudflare R2 图床上传器。图片在浏览器本地裁剪、压缩并转换为 WebP，再通过 Cloudflare Pages Function 写入 R2，适合为个人博客、Hugo 和 Obsidian 生成可直接粘贴的图片链接。

## 功能

- 支持点击选择、手机拍照、桌面拖拽，以及分多次追加图片。
- 本地缩略图、重复文件过滤、单张删除、清空、桌面拖拽排序和移动端上下移动。
- 分类、Slug、批量 Alt 与实时 R2 路径预览；高级压缩和命名设置默认折叠。
- 手机全屏裁剪器，支持自由、原图、1:1、4:3、3:2、16:9、9:16 和左右 90° 旋转。
- 浏览器本地 WebP 处理；跳过裁剪也会按当前预设压缩并转换为 WebP。
- 每张图片独立显示等待、编辑、压缩、上传、成功、失败和取消状态。
- 单张失败不阻断后续任务；可重试单张或全部失败项，已成功图片不会重复上传。
- 上传过程中可以取消当前请求和剩余队列。
- 同名对象默认自动改名为 `-2`、`-3` 等；覆盖必须由用户明确选择并再次确认。
- 结果卡片默认保持紧凑，可复制 Markdown、HTML 或 Hugo figure；技术字段按需展开。
- 键盘焦点、对话框焦点循环、触控尺寸、`aria-live` 和减少动画模式均已适配。

## 使用流程

1. 打开页面，点击右上角“设置”填写上传 Token。
2. 选择照片；需要时可继续添加、删除或调整顺序。
3. 设置分类、Slug 和批量 Alt 文本。
4. 查看预计保存路径；按需展开高级设置。
5. 选择“编辑后上传”，逐张裁剪、旋转和调整 Alt；或选择“跳过裁剪并上传”。
6. 查看每张图片的处理状态。单张失败不会影响后续图片。
7. 按需重试失败项，上传中也可取消剩余任务。
8. 选择 Markdown、HTML 或 Hugo figure，然后复制单张或全部结果。

在约 390px 宽的手机上，选择图片后会出现底部固定操作栏；安全区边距会自动适配。裁剪器使用全屏布局，确认操作始终位于顶部，不需要滚动寻找。

## 浏览器端设置与隐私

上传 Token 与普通偏好严格分开：

- Token 仅在内存和可选的 `sessionStorage` 中保存。默认勾选“本次会话记住”；关闭当前浏览器会话后由浏览器清除。
- Token 不会写入 `localStorage`、前端源码或控制台，也不会出现在错误消息中。
- 最近使用的分类、压缩预设、命名规则和复制格式保存在 `localStorage`。
- 冲突策略不会长期保存；新会话始终恢复为安全的“自动改名”。

管理页面仍建议使用 [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-apps/) 保护，只允许自己的身份访问。Token 是上传接口的第二层验证，不替代访问控制。

## 图片处理

所有裁剪、旋转、压缩和 WebP 编码都发生在浏览器本地。原图不会先上传到服务端。

| 预设 | 最长边 | WebP quality |
| --- | ---: | ---: |
| 均衡 | 1600px | 0.82 |
| 轻量 | 1200px | 0.72 |
| 高清 | 2200px | 0.90 |
| 仅转 WebP | 保留原尺寸 | 0.86 |

跳过裁剪时，处理链路会优先使用 `createImageBitmap()`，并直接将原图绘制到目标尺寸 Canvas，不创建额外的原尺寸中间 Canvas；不支持时自动退化到 `Image + object URL`。图片完成后会关闭 `ImageBitmap`、清空 Canvas，并释放不再使用的 Object URL。

## 路径与同名保护

默认 R2 key：

```text
category/YYYY/MM/slug-序号.webp
```

也支持：

```text
category/slug-序号.webp
YYYY/MM/category/slug-序号.webp
category/YYYY/MM/slug-时间戳-序号.webp
category/YYYY/MM/原文件名-序号.webp
```

分类包括 `blog`、`travel`、`books`、`tailor` 和 `misc`。

服务端只用 `R2.head()` 检查当前请求的具体 key：

- **自动改名（默认）**：若目标存在，依次尝试 `name-2.webp`、`name-3.webp` 等。
- **取消该图片**：若目标存在，返回冲突错误，队列继续处理下一张。
- **覆盖已有文件**：只有前端明确选择并确认后才会传入此策略。

项目不会列举或扫描整个 R2 Bucket。上传结果会显示服务端实际使用的 key 和公开 URL。

## 输出格式

Markdown：

```markdown
![图片描述](https://img.philohao.com/blog/2026/07/trip-01.webp)
```

HTML：

```html
<img src="https://img.philohao.com/blog/2026/07/trip-01.webp" alt="图片描述" loading="lazy">
```

Hugo figure：

```go-html-template
{{< figure src="https://img.philohao.com/blog/2026/07/trip-01.webp" alt="图片描述" >}}
```

## 项目结构

项目保持无前端构建步骤的原生 HTML、CSS 和 ES Modules：

```text
public/
  index.html
  styles.css
  js/
    app.js                 # 页面初始化与上传队列编排
    config.js              # 预设与常量
    crop-editor.js         # 裁剪、旋转与焦点管理
    files.js               # 选图、缩略图、排序与删除
    image-processing.js    # WebP 处理与资源释放
    results.js             # 汇总、结果卡片与复制
    settings.js            # Token、偏好和路径预览
    state.js               # 轻量页面状态
    upload.js              # 上传请求
    utils.js               # 命名、格式化和通用函数
functions/
  api/upload.ts            # Origin、Token、冲突检查与 R2 写入
```

Cloudflare Pages 仍可直接部署 `public/`，无需 React、Vue、Tailwind 或打包器。

## 本地开发

安装依赖：

```bash
npm install
```

复制示例配置：

```bash
cp wrangler.toml.example wrangler.toml
```

创建仅供本地使用且已被 `.gitignore` 忽略的 `.dev.vars`：

```bash
PUBLIC_BASE_URL=https://img.philohao.com
ALLOWED_ORIGIN=http://localhost:8788
UPLOAD_TOKEN=replace-with-a-long-random-token
```

启动 Cloudflare Pages 本地服务：

```bash
npm run dev
```

运行 TypeScript 和全部前端模块语法检查：

```bash
npm run check
```

## 部署到 Cloudflare Pages

1. 将仓库连接到 Cloudflare Pages，生产分支设为 `main`。
2. 构建命令可留空或使用 `npm run build`。
3. 构建输出目录设置为 `public`。
4. 添加 R2 binding：变量名必须是 `IMAGES`，指向目标 Bucket。
5. 添加环境变量：

   ```text
   PUBLIC_BASE_URL=https://img.philohao.com
   ALLOWED_ORIGIN=https://img-admin.philohao.com
   ```

6. 添加 Secret：

   ```text
   UPLOAD_TOKEN=一串足够长的随机字符串
   ```

7. 绑定管理域名 `img-admin.philohao.com`，并确保它与 `ALLOWED_ORIGIN` 完全一致。

本次重构不需要新增环境变量、KV、数据库、Cloudflare Images 或额外 R2 binding。

## 安全边界

- 前端永远不需要 R2 Access Key；上传仅通过 Pages Function 的 `IMAGES` binding。
- API 先校验精确 Origin，再校验 Bearer Token。
- API 只接收支持的图片类型、非空文件和安全的 `.webp` key。
- `.dev.vars`、`wrangler.toml` 和真实 Token 不应提交到仓库。
- 定期轮换 `UPLOAD_TOKEN`，尤其是在怀疑泄露时。
