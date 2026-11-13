# Miru · 下一幕

一个部署在 Cloudflare Workers 上的个人番剧观看记录站

## 特性

- **发现**：搜索 Bangumi 番剧、翻今日放送表，一键加入片单
- **书架**：按状态（在看 / 想看 / 看过 / 搁置 / 抛弃）筛选，按评分或更新时间排序，网格与列表两种视图，分页浏览
- **详情页**：封面、简介、标签、制作信息；切换状态、1–10 分评分、集数进度，点任意一集直接跳到那一集；想法时间线
- **首页**：继续看、最近记录、最近想法、今日放送、统计（总记录 / 在看 / 看完 / 累计集数 / 平均评分）
- **账号**：邮箱注册登录，改昵称与密码，导出全部数据为 JSON，退出其他设备，删除账号
- **站点管理**：第一个注册的账号自动成为管理员，可开关「站点注册」「注册需要邀请码」
- **外观**：浅色 / 深色 / 跟随系统

## 本地启动

```bash
npm install
npm run dev
```

打开终端输出的地址（默认 http://localhost:5173）。首次注册任意邮箱即可，第一个账号即管理员

## 部署到 Cloudflare

1. 打开 Cloudflare 控制台 → **Workers & Pages** → **Create** → **Workers** → **Connect to Git**（Import a repository），授权后选中本仓库
2. 构建设置保持默认即可：Build command 填 `npm run build`，Deploy command 填 `npx wrangler deploy`
3. 保存并部署。首次部署会自动创建 D1 库，表结构由 Worker 在第一次被访问时建好
4. 部署完成后打开 `https://<worker 名>.<子域>.workers.dev`，按页面提示去 **Settings → Variables and Secrets** 添加一个 Secret：`BETTER_AUTH_SECRET`，值是 32 字符以上的随机串

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DB` | 是 | D1 绑定，`wrangler.jsonc` 已配置；不写 ID 即由 Cloudflare 自动创建 |
| `BETTER_AUTH_SECRET` | 生产必填 | 会话签名密钥；漏配时站点显示配置提示页 |
| `BETTER_AUTH_URL` | 否 | 站点对外地址，如 `https://miru.example.com`；不配则由请求 host 推导 |
| `BGM_IMG_BASE` | 否 | Bangumi 图片镜像域，如 `https://bgmimg.example.com` |
| `BGM_UA` | 否 | 请求 Bangumi 时带的 User-Agent |

除 `DB`、`ASSETS` 两个绑定外，其余变量都配在 Cloudflare 后台的 **Settings → Variables and Secrets**。`wrangler.jsonc` 已开启 `keep_vars`，后台配好的变量重新部署时不会被清掉。

## 许可证

[MIT](LICENSE)