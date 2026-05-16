# R2 Image Uploader

一个部署到 Cloudflare Pages 的在线图片上传器，用作个人 Hugo 博客图床管理工具。

## 项目用途

这个项目提供一个私有上传页面，用于把图片上传到 Cloudflare R2，并生成可直接粘贴到 Hugo / Pages CMS 文章正文中的 Markdown 图片链接。

核心流程：

1. 在浏览器中选择或拖拽图片。
2. 浏览器本地通过 Canvas 将图片压缩并转换为 WebP。
3. 按分类、年月、slug 和序号生成 R2 对象路径。
4. 通过 Cloudflare Pages Function 写入 R2 bucket。
5. 返回公开图片 URL 和 Markdown 图片链接。

生成的 R2 key 格式：

```text
category/YYYY/MM/slug-序号.webp
```

示例：

```text
blog/2026/05/hugo-pages-cms-01.webp
travel/2026/05/los-angeles-01.webp
books/2026/05/book-cover-01.webp
```

Markdown 示例：

```markdown
![hugo-pages-cms](https://img.philohao.com/blog/2026/05/hugo-pages-cms-01.webp)
```

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
4. 输入 slug，例如 `hugo-pages-cms`。如果留空，会基于第一个原始文件名自动生成安全 slug。
5. 拖拽或选择一张或多张图片。
6. 点击“上传图片”。
7. 上传成功后复制 Markdown 链接。
8. 将 Markdown 链接粘贴到 Pages CMS / Hugo 文章正文。

## 安全注意事项

- 不要把 `UPLOAD_TOKEN` 写入前端源码。
- 不要把 R2 Access Key 放进浏览器。
- 本项目使用 Cloudflare Pages Function 的 R2 binding 上传图片，前端永远不需要 R2 Access Key。
- 建议后续给 `img-admin.philohao.com` 加 Cloudflare Access，只允许自己的账号访问上传页面。
- 定期轮换 `UPLOAD_TOKEN`，尤其是在怀疑 token 泄露时。
