# 二次开发声明 / Fork Notice

## 项目来源

本项目基于 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 克隆而来，进行**二次开发**。

- **上游仓库:** https://github.com/basketikun/infinite-canvas （仅作为后期更新对照使用，不向其推送代码）
- **本仓库性质:** 独立的二次开发项目，当前处于**开发测试阶段**
- **发布计划:** 开发完成后将发布至开发者自己的仓库，届时会更新本声明中的仓库地址

## 与上游的主要差异

在保留上游 React 无限画布、生成服务、Zustand 状态和浏览器本地存储架构的基础上，本项目额外迁移/新增了 DMDS 的 AI 绘画能力，包括但不限于：

- BizyAir 专业工作流（图纸渲染、双相机多角度、AI 超分）及可恢复任务中心
- 腾讯云 COS 媒体同步层（本地优先上传队列、失败重试、同步中心）
- 画布图片工具（双图滑杆对比、360° 全景查看与生成、非破坏性标注）
- 局部重绘增强（比例选区、羽化、附加参考图）与专业角色工作流
- 提示词库 / 角色 / 模型配置改为项目内置 JSON 文件（`web/public/`），支持管理员配置自动下发

完整变更记录见 [CHANGELOG.md](CHANGELOG.md)。

## 第三方数据与内容

- **灵感画廊提示词数据**（`web/public/gallery.json`、`web/public/prompts.json` 中 `nbp-` 前缀条目）与**提示词增强系统提示词**（`web/src/lib/prompt-enhance.ts`）来自 [NanoBanana Trending Prompts](https://github.com/jau123/nanobanana-trending-prompts) 项目，© [MeiGen.ai](https://meigen.ai)，采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 许可。本项目对数据做了格式转换（字段映射、标题生成、分类中文化），提示词增强系统提示词做了轻微改编。数据由 `web/scripts/build-gallery.mjs` 生成，可随上游更新重建。
- 灵感画廊条目的封面图片托管在 `images.meigen.ai`，由浏览器直接加载，本项目不做镜像与再分发。

## 许可证

上游项目采用 **AGPL-3.0** 许可证（见 [LICENSE](LICENSE)）。本项目作为其衍生作品，同样遵循 AGPL-3.0：后续公开发布或提供网络服务时，需以相同许可证开放对应源代码，并保留原作者版权声明。

## 免责说明

- 本仓库当前仅用于本地开发与测试，`web/public/config.json` 等文件中的配置仅供开发环境使用。
- 本项目与上游作者无隶属或合作关系，上游仓库不对本项目的修改内容负责。
