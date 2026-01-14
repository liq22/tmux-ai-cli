下面按**三种发布渠道**讲：①官方 VS Code Marketplace（微软）②Open VSX（VSCodium/Theia 等常用）③只发 `.vsix` 私下分发。

---

## 1) 发布到 VS Code Marketplace（微软官方）

### A. 本地打包/发布工具

安装 `vsce`： ([Visual Studio Code][1])

```bash
npm install -g @vscode/vsce
```

### B. 准备 `package.json` 的关键字段

至少要有：

* `name`, `displayName`, `version`
* `publisher`（这就是你的 publisher id/命名空间）([Visual Studio Code][1])
* `engines.vscode`
* `icon`（**不能是 SVG**；README/CHANGELOG 里的图片也有 SVG 限制）([Visual Studio Code][1])

> 常见坑：Marketplace 对 `keywords/tags` 数量有限制（超过会报错）。([Visual Studio Code][1])

### C. 生成 Azure DevOps 的 PAT（发布必须）

VS Code Marketplace 的发布认证走 Azure DevOps，`vsce` 只能用 PAT。([Visual Studio Code][1])
PAT 创建时几个关键点：([Visual Studio Code][1])

* Organization 选 **All accessible organizations**
* Scopes 里选 **Marketplace → Manage**

（如果你还没有 Azure DevOps organization，需要先创建一个。([Visual Studio Code][1])）

### D. 创建 Publisher（Marketplace 管理后台）

到 Marketplace 的 publisher 管理页创建 publisher（ID 一旦创建不可改）。([Visual Studio Code][1])

### E. `vsce login` 绑定 publisher + PAT

```bash
vsce login <publisher-id>
# 按提示粘贴 PAT
```

官方流程就是这样验证 publisher 的。([Visual Studio Code][1])

### F. 发布

自动发布（最常用）：([Visual Studio Code][1])

```bash
vsce publish
```

自动升级版本也支持：([Visual Studio Code][1])

```bash
vsce publish patch
# 或 minor / major
```

只想先生成 `.vsix` 再手动上传也可以：([Visual Studio Code][1])

```bash
vsce package
# 然后去 Marketplace 管理页上传 vsix
```

---

## 2) 同时发布到 Open VSX（强烈建议一起发）

Open VSX 的发布流程（Eclipse / open-vsx.org）：需要 **Eclipse 账号 + 签 Publisher Agreement + token + namespace + publish**。([GitHub][2])

最简命令流（在扩展目录内）：([GitHub][2])

```bash
# 第一次需要创建命名空间（publisher 字段对应 namespace）
npx ovsx create-namespace <publisher> -p <openvsx_token>

# 发布（可直接从源码发布；或 publish <file.vsix>）
npx ovsx publish -p <openvsx_token>
```

---

## 3) 只分发 `.vsix`（不公开上架）

你可以只打包：([Visual Studio Code][1])

```bash
vsce package
```

然后把生成的 `.vsix` 发给别人，让他们在 VS Code 里 “Install from VSIX”。

---

## 两个发布时最容易踩的坑

* **SVG 图片限制**：icon/badges/README 图片涉及 SVG 会被 vsce 拒绝发布（除非来自可信 provider）。([Visual Studio Code][1])
* **401/403**：PAT 的 Organization 没选 “All accessible organizations” 或 scope 没选 “Marketplace (Manage)”。([Visual Studio Code][1])

如果你愿意，把你扩展的 `package.json`（去掉敏感信息）贴一段，我可以按 Marketplace + Open VSX 的要求给你做一次“发布前检查清单”。

[1]: https://code.visualstudio.com/api/working-with-extensions/publishing-extension "Publishing Extensions | Visual Studio Code Extension
API"
[2]: https://github.com/eclipse/openvsx/wiki/Publishing-Extensions "Publishing Extensions · eclipse/openvsx Wiki · GitHub"
