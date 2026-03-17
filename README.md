# Cloudflare Pages 示例（静态站）

本目录是一个**纯静态网站**示例：`index.html` + `styles.css`。

## 本地预览

由于歌单从 `data/playlist.json` 读取，**不建议双击 `index.html`（file://）打开**，部分浏览器会拦截本地读取。

推荐用一个本地静态服务器预览：

```powershell
cd D:\ppt\cf-pages-demo
python -m http.server 5173
```

然后在浏览器打开：`http://127.0.0.1:5173/`

也可以直接双击运行：`一键启动预览.bat`
（或英文版：`start_preview.bat`）

## 自动获取主播昵称/开播状态（生成静态 JSON）

本项目会从 `data/profile.json` 读取「主播昵称、开播状态」并展示在页面标题旁边。

运行下面命令会根据 `DOUYIN_LIVE_ID`（默认 `49330409995`）抓取一次并写入 `data/profile.json`：

```powershell
cd D:\ppt\cf-pages-demo
python .\tools\update_profile.py
```

或者双击运行：`一键更新信息并预览.bat`
（或英文版：`update_and_preview.bat`）

## 实时开播状态（Cloudflare Pages Functions）

部署到 Cloudflare Pages 后，页面会优先请求 `GET /api/status?live_id=...` 来获取实时状态（每 30 秒刷新一次）。

- **接口代码**：`functions/api/status.js`
- **本地预览说明**：用 `python -m http.server` 预览时不会运行 Functions，所以本地会自动回退读 `data/profile.json`（不影响线上）。

## 留言板（Cloudflare Pages Functions + D1）

留言板接口是 `GET/POST /api/guestbook`，需要 Cloudflare **D1** 数据库绑定为 `DB`。

部署步骤（Cloudflare Dashboard）：

1. 创建 D1 数据库（任意名字）
2. 在 Pages 项目里把 D1 绑定到变量名 **`DB`**
3. 部署后打开页面即可在线留言

本地用 `python -m http.server` 预览时不会运行 Functions，所以留言板会显示提示“本地预览不会运行后端接口”。

## 部署到 Cloudflare Pages（最简）

1. 把 `cf-pages-demo/` 这个目录推到 GitHub 仓库里
2. 登录 Cloudflare → Pages → Create a project → 连接 GitHub → 选择仓库
3. **Framework preset** 选 `None`
4. **Build command** 留空
5. **Build output directory** 留空（或填 `/`，按 Cloudflare UI 提示为准）
6. 部署完成后，会得到一个 `*.pages.dev` 地址，任何人都能访问

> 如果你把示例放在仓库子目录（比如 `cf-pages-demo`），就在 Pages 的设置里把“根目录/Root directory”指向它。

