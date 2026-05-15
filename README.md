# Fark Bing AD

> **AI 项目声明 / AI Project Notice**  
> 本项目由用户提出需求、测试反馈与使用场景，主要代码、文档和规则整理由 AI 辅助生成与迭代完成。  
> This project was built through user-provided requirements, testing feedback, and AI-assisted code/documentation generation.

Fark Bing AD 是一个用于过滤 Bing 搜索结果广告的 Tampermonkey / 油猴用户脚本，目标是尽量减少 Bing 搜索页中的广告结果、伪装广告、MSAN 嵌入式广告以及广告删除后的残留分隔线。

## 功能特性

- 删除 Bing 顶部广告结果
- 删除伪装成自然搜索结果的广告
- 删除 MSAN 嵌入式广告
- 识别 `initLinks(..., bing.com/aclick...)` 伪装广告跳转
- 识别 `p::before` 形式的广告徽标
- 删除广告残留横线、空广告外壳和顶部广告区残留分割线
- 支持 Bing Ajax 翻页后的二次清理
- 支持全广告空结果页自动跳页
- 支持 Log 面板
- 支持广告命中统计 / 清理动作统计
- 支持性能优化开关
- 支持重置统计数据

## 项目说明

本项目属于 **AI 辅助开发项目**。

项目的需求、问题样本、页面截图、规则验证和实际测试由用户提供；脚本规则、代码实现、版本迭代说明和文档由 AI 根据用户反馈辅助生成。

因此，本项目具有以下特点：

- 规则来自真实页面测试和人工反馈
- 代码由 AI 辅助编写，可能仍存在边界问题
- 不保证适配 Bing 后续所有页面结构变化
- 欢迎提交 Issue、截图、DOM 结构和复现关键词帮助改进

## 安装方式

### 从 Greasy Fork 安装

发布后可在这里填写 Greasy Fork 地址：

```text
https://greasyfork.org/scripts/你的脚本地址
```

### 从 GitHub 安装

安装 Tampermonkey / 油猴后，打开以下 Raw 地址即可安装：

```text
https://raw.githubusercontent.com/CX330-YCH/Fark-Bing-AD/main/Fark-Bing-AD.user.js
```


## 使用方式

安装脚本后，访问 Bing 搜索页即可自动运行：

```text
https://www.bing.com/search
https://cn.bing.com/search
https://bing.com/search
```

支持的油猴菜单：

- 开启 / 关闭 Log 面板
- 开启 / 关闭性能优化
- 开启 / 关闭自动跳过空广告页
- 重置广告统计

## 适配范围

当前脚本主要适配：

- Bing 中文搜索页
- Bing 国际搜索页
- `www.bing.com/search`
- `cn.bing.com/search`
- `bing.com/search`

已处理过的广告类型包括：

- `b_ad` 传统广告容器
- `AdSlug / acf-badge` 广告标识
- `MSAN` 嵌入式广告
- `p.b_lineclamp::before` 伪元素广告
- `initLinks aclick` 伪装广告跳转
- 顶部广告区残留分割线
- 空广告外壳
- 全广告空结果页

## 注意事项

本脚本仅用于改善个人搜索体验。

由于 Bing 页面结构会不断变化，本脚本可能出现以下情况：

- 某些广告没有被删除
- 某些广告会先短暂出现再消失
- 某些页面需要等待延迟扫描
- 极少数特殊结果块可能被误判

如果遇到问题，建议提交：

- 搜索关键词
- 页面截图
- 对应 DOM 结构
- 是否开启 Log 面板
- 浏览器和油猴版本

## 开发与维护

项目建议文件结构：

```text
Fark-Bing-AD/
├── Fark-Bing-AD.user.js
├── README.md
├── CHANGELOG.md
└── LICENSE
```

每次更新脚本时，请同步修改脚本头部版本号：

```javascript
// @version      1.0.x
```

并在 `CHANGELOG.md` 中记录变化。

## 免责声明

本项目为个人学习、研究和体验优化用途。

本项目不隶属于 Microsoft、Bing、Greasy Fork、Tampermonkey 或任何广告平台。  
脚本的使用效果取决于 Bing 当前页面结构和浏览器环境。  
使用者需自行承担使用脚本带来的风险。

## License

MIT License
