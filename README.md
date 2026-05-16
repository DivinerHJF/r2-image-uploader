# R2 Image Uploader

一个部署到 Cloudflare Pages 的在线图片上传器，用作个人 Hugo 博客图床管理工具。

## 项目用途

这个项目提供一个私有上传页面，用于把图片上传到 Cloudflare R2，并生成可直接粘贴到 Hugo / Pages CMS 文章正文中的 Markdown 图片链接。

核心流程：

1. 在浏览器中选择或拖拽图片，并可在上传前通过拖拽文件条目调整多图顺序。
2. 浏览器本地弹出裁剪界面，可选择裁剪比例或跳过裁剪。
3. 浏览器本地按所选压缩预设通过 Canvas 将裁剪结果压缩并转换为 WebP。
4. 浏览器端按所选重命名规则生成 R2 对象路径，不扫描 R2 bucket。
5. 通过 Cloudflare Pages Function 写入 R2 bucket。
6. 返回公开图片 URL、压缩前后体积对比，以及 Markdown / HTML / Hugo figure 复制格式。

默认生成的 R2 key 格式：

```text
category/YYYY/MM/slug-序号.webp
```

也可以在上传前选择其他浏览器端重命名规则：

```text
category/slug-序号.webp
YYYY/MM/category/slug-序号.webp
category/YYYY/MM/slug-时间戳-序号.webp
category/YYYY/MM/原文件名-序号.webp
```

示例：

```text
blog/2026/05/hugo-pages-cms-01.webp
travel/los-angeles-01.webp
2026/05/books/book-cover-01.webp
misc/2026/05/screenshot-20260516-153000-01.webp
```

复制格式示例：

```markdown
![Hugo Pages CMS 截图](https://img.philohao.com/blog/2026/05/hugo-pages-cms-01.webp)
```

```html
<img src="https://img.philohao.com/blog/2026/05/hugo-pages-cms-01.webp" alt="Hugo Pages CMS 截图" loading="lazy">
```

```go-html-template
{{< figure src="https://img.philohao.com/blog/2026/05/hugo-pages-cms-01.webp" alt="Hugo Pages CMS 截图" >}}
```

## 图片裁剪

选择图片后会先在浏览器本地打开裁剪界面，支持单图和多图逐张处理。每张图片都必须先进入裁剪流程；只有点击“跳过裁剪”时，才会直接使用原图进入原有压缩上传流程。每张图片都可以选择“确认裁剪并上传”“跳过裁剪”或“取消”。

支持的裁剪比例：

- 自由裁剪
- 原图比例
- 1:1
- 4:3
- 3:2
- 16:9
- 9:16

裁剪完全发生在浏览器本地：原图不会因为裁剪功能而额外上传到服务器。只有确认裁剪或跳过裁剪后生成的最终 WebP 文件会通过 `/api/upload` 上传到 R2。

## 浏览器端轻量功能

新增功能仍遵循“尽量在浏览器端完成”的原则，不增加数据库、不引入 Cloudflare Images、不做服务端图片处理、不扫描 R2 bucket，因此不会因为这些功能增加 Cloudflare 侧图片处理或存储扫描成本。

### 压缩预设和体积对比

上传前可以选择压缩预设：

- 均衡：最长边 1600px，WebP quality 0.82。
- 轻量：最长边 1200px，WebP quality 0.72。
- 高清：最长边 2200px，WebP quality 0.9。
- 仅转 WebP：保留原尺寸，WebP quality 0.86。

每张图上传成功后都会显示原始体积、压缩后体积、节省或增加的大小和百分比，以及压缩后的像素尺寸。

### Alt 文本与多格式复制

上传设置中可以输入 Alt 文本。单图会直接使用该 Alt；多图会按当前排序自动追加 `01`、`02` 等序号。留空时使用 slug 作为 Alt 基础值。

上传结果会同时生成：

- Markdown：`![alt](url)`
- HTML：`<img src="url" alt="alt" loading="lazy">`
- Hugo figure：`{{< figure src="url" alt="alt" >}}`

可以一键复制全部 Markdown，也可以通过“复制格式”选择 Markdown / HTML / Hugo figure 并批量复制当前所有上传结果。

### 多图排序与命名规则

多图选择后，可以拖拽文件条目或使用上下箭头调整顺序。上传顺序、序号、Alt 序号和批量复制结果都按当前列表顺序生成。

可选命名规则全部在浏览器端生成 key：

- `category/YYYY/MM/slug-序号.webp`
- `category/slug-序号.webp`
- `YYYY/MM/category/slug-序号.webp`
- `category/YYYY/MM/slug-时间戳-序号.webp`
- `category/YYYY/MM/原文件名-序号.webp`

## 本地开发

安装依赖：

```bash
npm install
```

复制示例配置：

```bash
cp wrangler.toml.example wrangler.toml
```

创建本地环境变量文件 `.dev.vars`：

```bash
PUBLIC_BASE_URL=https://img.philohao.com
ALLOWED_ORIGIN=http://localhost:8788
UPLOAD_TOKEN=replace-with-a-long-random-token
```

> 线上环境请把 `ALLOWED_ORIGIN` 设置为 `https://img-admin.philohao.com`。

启动 Cloudflare Pages 本地开发服务器：

```bash
npm run dev
```

运行类型检查：

```bash
npm run check
```

项目没有前端打包步骤，`public/` 中的静态文件会直接由 Cloudflare Pages 提供。

## 部署到 Cloudflare Pages

1. 将仓库连接到 Cloudflare Pages。
2. 选择生产分支，例如 `main`。
3. 构建命令可以留空，或填写：

   ```bash
   npm run build
   ```

4. 构建输出目录设置为：

   ```text
   public
   ```

5. 部署后，`functions/api/upload.ts` 会作为 Pages Function 暴露为：

   ```text
   /api/upload
   ```

## 设置 R2 binding

在 Cloudflare Pages 项目的设置中添加 R2 binding：

```text
Variable name: IMAGES
R2 bucket: 你的 R2 bucket
```

binding 名称必须是 `IMAGES`，因为 Pages Function 会通过 `context.env.IMAGES` 写入图片。

`wrangler.toml.example` 中也提供了本地开发示例：

```toml
[[r2_buckets]]
binding = "IMAGES"
bucket_name = "YOUR_R2_BUCKET_NAME"
```

## 设置环境变量

在 Cloudflare Pages 项目的 Settings → Environment variables 中设置：

```text
PUBLIC_BASE_URL=https://img.philohao.com
ALLOWED_ORIGIN=https://img-admin.philohao.com
```

说明：

- `PUBLIC_BASE_URL` 是图片公开访问域名，用于拼接上传成功后的 URL。
- `ALLOWED_ORIGIN` 是允许访问上传 API 的管理页面域名。

## 设置 Secret

在 Cloudflare Pages 项目的 Secrets 中设置：

```text
UPLOAD_TOKEN=一串足够长的随机字符串
```

建议使用密码管理器或命令生成高强度随机字符串，例如：

```bash
openssl rand -base64 48
```

不要把 `UPLOAD_TOKEN` 写入前端源码，也不要提交到 Git 仓库。

## 绑定自定义域名 `img-admin.philohao.com`

1. 打开 Cloudflare Pages 项目。
2. 进入 Custom domains。
3. 添加自定义域名：

   ```text
   img-admin.philohao.com
   ```

4. 按 Cloudflare 提示完成 DNS 记录配置。
5. 确认 Pages 项目可通过 `https://img-admin.philohao.com` 访问。
6. 确认 Pages 环境变量中 `ALLOWED_ORIGIN` 也是：

   ```text
   https://img-admin.philohao.com
   ```

图片公开访问域名 `https://img.philohao.com` 应指向你的 R2 公开访问域名或自定义域名。

## 使用方式

1. 打开上传器：`https://img-admin.philohao.com`。
2. 在“上传 Token”中输入 Cloudflare Pages Secret 配置的 token。
3. 选择分类：`blog`、`travel`、`books` 或 `misc`。
4. 输入 slug 和可选 Alt 文本；slug 留空时会基于第一个原始文件名自动生成安全 slug。
5. 选择压缩预设和上传前重命名规则。
6. 拖拽或选择一张或多张图片，并按需要拖拽文件条目排序。
7. 点击“裁剪并上传”，然后在裁剪弹窗中为每张图片选择比例并确认，或点击“跳过裁剪”。
8. 上传成功后查看压缩前后体积对比，并复制全部 Markdown 或所选 Markdown / HTML / Hugo figure 格式。
9. 将复制结果粘贴到 Pages CMS / Hugo 文章正文。

## 安全注意事项

- 不要把 `UPLOAD_TOKEN` 写入前端源码。
- 不要把 R2 Access Key 放进浏览器。
- 本项目使用 Cloudflare Pages Function 的 R2 binding 上传图片，前端永远不需要 R2 Access Key。
- 建议后续给 `img-admin.philohao.com` 加 Cloudflare Access，只允许自己的账号访问上传页面。
- 定期轮换 `UPLOAD_TOKEN`，尤其是在怀疑 token 泄露时。
