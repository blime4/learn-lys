# learn-lys

一个用 Obsidian 管理本地知识、用 GitHub Pages 展示公开课程的学习站。课程按概念、练习与实验逐步推进，读过、练习过与实际验证通过分别记录。

学习流程借鉴 [Study-Mate](https://github.com/Miaotofu01/Study-Mate) 的课程路线、练习与持久学习记录设计。本项目独立实现静态站点，没有安装 Study-Mate 插件，也不声称与其工作区或最新版本完全兼容。

## 本地阅读与编辑

在 Obsidian 中选择「打开本地仓库」，选中当前 `learn-lys` 文件夹，打开本地的 `首页.md`。无需社区插件，双链、反向链接、搜索和模板均使用内置功能。

- `notes/public/`：经过脱敏的通用课程，公开网页的内容来源。
- `notes/private/`：本地完整资料、学习证据、参考附件和模板，不提交 Git。
- `.obsidian/`：当前设备的 Obsidian 配置，不提交 Git。
- `learning-state.json`、`首页.md`：本地完整学习档案与入口，不提交 Git。
- `site/`：网页外观、公开元数据和发布清单。

新设备克隆仓库只能取得公开内容。完整知识库请通过自己认可的本地备份方式保留；GitHub Pages 不是私人资料备份。

## 本地预览

需要 Node.js 与 npm：

```sh
npm ci
npm test
npm run build
npm run dev
```

在浏览器打开开发命令打印的本地地址。网页使用相对资源路径，支持 GitHub Pages 的项目子路径。

## 本地完整学习模式

公开网页无法直接读取电脑上的私人笔记。需要阅读本地知识库时，在仓库目录运行：

```sh
npm run local
```

Windows 也可以双击 `scripts/start-local.cmd`。命令先构建公开页面，再启动只监听本机的只读服务；保持启动窗口运行，打开命令打印的 `http://127.0.0.1:4318`。浏览器中的本地模式链接只能连接已经运行的服务，无法凭静态网页按钮启动尚未运行的进程。端口已占用时会明确报错，请先关闭之前的服务。

本地模式读取私有笔记目录中的 Markdown、HTML 和 JSON，支持课程阅读、双链与 Obsidian 跳转。HTML 附件以清理后的正文展示，原有脚本、样式、远程图片及嵌入内容不会执行；JSON 以转义后的文本展示。单个文件上限 5 MB，索引最多 1000 个文档、16 层子目录，并限制扫描条目总量；超出范围不纳入索引。符号链接不纳入索引。服务不提供笔记写入接口；“在 Obsidian 打开”仅向本机应用提交打开请求，不会自动修改笔记，也不代表已经确认打开成功。

完整资料只经过本机接口读取，不会加入公开构建或上传 GitHub Pages；本地 API 使用同源会话校验，不向其他网站提供跨域读取。本地知识库仍需自行备份。关闭启动窗口或按 Ctrl+C 可停止服务。

### 接入已经使用的 Obsidian 仓库

可以在现有仓库中选择一个独立项目子目录，保留原笔记。在本机的 `.local/obsidian.json` 填写配置；该文件已被 Git 忽略，不能提交实际用户目录与私人资料映射。

```json
{
  "vaultPath": "替换为现有仓库的绝对路径",
  "projectPath": "Projects/learn-lys",
  "vaultId": "替换为本机登记的仓库ID",
  "documentCards": {
    "reference/source.html": "reference/source.md",
    "record.json": "record.md"
  }
}
```

配置存在时，完整知识库从目标项目子目录读取，Obsidian 在同一位置编辑；未配置时仍使用当前仓库。先在 Obsidian 中打开目标仓库一次，服务会核对本机登记的仓库 ID 与路径，未登记或不匹配时明确提示，不会假装成功。

配置外部仓库后，本地 API 与 Obsidian 读取目标项目目录中的笔记，公开网页构建仍读取代码仓库里的 `notes/public/`。两份内容不会自动双向同步。在 Obsidian 中编辑公开课程后，需要手动将经过脱敏审查的 Markdown 同步回代码仓库对应的公开笔记，再审查变更、运行检查和构建、提交推送。只复制获准公开的课程，不要把整个外部知识库复制回代码仓库。

Markdown 笔记直接打开；HTML、JSON 等附件需要对应 Markdown 资料卡，`documentCards` 使用私有目录内的相对路径指定映射。未指定映射时尝试同目录同名 `.md`，找不到则继续在本地网页阅读原文。Obsidian 不原生把普通 HTML、JSON 当作 Markdown 笔记编辑。

本地按钮通过受保护的同源操作调用已安装的 Obsidian，不依赖浏览器放行外部协议，也不要求安装 Obsidian CLI。该操作只接受已索引的资料标识或发布清单中的课程标识，不接受程序、命令、任意文件路径或 URI。公开网页仍须先进入本机页面。公开课程要在 Obsidian 打开，还需将获准公开的笔记同步到同一个目标项目目录。

## 从 Obsidian 更新网页

1. 在 `notes/public/` 编辑或创建通用知识笔记。
2. 填写 frontmatter，明确 `publish: true` 与 `visibility: public`。
3. 将相对文件路径加入 `site/publish.json`。未列入清单的笔记不会进入网页输出。
4. 运行 `npm test`、`npm run build`、`npm run check:public`。
5. 审查 Git 变更，将获准公开的笔记和更新后的 `site/publish.json` 一起提交并推送到 `main`，GitHub Actions 生成并部署 `dist`。

示例笔记属性：

```yaml
id: example
title: 一节课程的标题
summary: 说明这节课要解决的问题。
kind: 概念
week: 1
status: 未开始
minutes: 15
tags: [张量, 访存]
publish: true
visibility: public
```

笔记支持 Markdown 和 `[[01-data-volume|显示文本]]` 双链。公开笔记只能链接已发布课程；原始 HTML 不作为可执行内容发布。不要把公司内部链接、完整硬件规格、私人学习记录或原始附件复制进公开笔记。

发布清单与显式属性共同决定网页输出范围。公开 Git 仓库中的源码也能直接被读取，因此未批准的笔记或附件不能放进受 Git 跟踪的公开路径；即使它们没有进入网页，也不能留在公开仓库中。

`npm run check:public` 会检查受跟踪的笔记是否同时列入发布清单并声明 `publish: true`、`visibility: public`。提交前仍需审查全部源码变更与新增文件；自动检查用于发现常见误带内容，不能把扫描通过等同于资料获准公开。

## 进度与作答

网页使用浏览器本地存储保存阅读或自测状态，不需要账号与服务器。它不会自动写回磁盘、同步到其他设备，或更新 Obsidian 中的正式学习记录。

需要保留网页进度时，使用站点提供的导出功能下载数据，保存在本地私有区域。再结合实际练习与运行证据整理笔记；正式状态由笔记属性维护，重新构建后更新网页。自测完成不等同于真实设备验证通过。

## GitHub Pages

工作流位于 `.github/workflows/pages.yml`。仓库 Settings → Pages 的发布来源应选择 GitHub Actions。只有 `dist` 上传为 Pages 产物，私有资料不进入产物或公开仓库。

部署后使用 GitHub 返回的实际网址。新建仓库、启用 Pages 或首次部署的状态，以 GitHub 的结果为准。

## 参考

- [Study-Mate](https://github.com/Miaotofu01/Study-Mate)：学习工作流的参考项目。
- [Obsidian 内部链接](https://help.obsidian.md/Linking+notes+and+files/Internal+links)：本地双链行为。
- [GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)：静态站发布方式。
- [TileLang](https://github.com/tile-ai/tilelang)：公开项目入口，与本地补充资料的版本分别核对。
