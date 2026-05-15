# Fuck_Bing_Search_Ad
**AI 项目声明 / AI Project Notice**  
本项目由用户提出需求、提供真实页面截图与测试反馈，主要代码、规则设计、文档整理和版本迭代由 AI 辅助生成。  
This project was developed from user-provided requirements, real-world Bing page samples, testing feedback, and AI-assisted code/documentation generation.
**性能影响提示 / Performance Notice**  
本脚本会对 Bing 搜索页面进行 DOM 扫描、广告结构判断、样式读取、MutationObserver 监听和动态清理。  
在低性能设备、结果页广告较多、频繁翻页、开启 Log 面板时，可能造成页面短暂卡顿、广告短暂闪现后消失、搜索结果加载略慢等现象。  
日常使用建议保持“性能优化”开启，并关闭 Log 面板。

Fuck_Bing_Search_Ad 是一个用于过滤 Bing 搜索结果广告的 Tampermonkey / 油猴用户脚本。
它主要用于清理 Bing 搜索页中的广告结果、伪装广告、MSAN 嵌入式广告、`p::before` 广告标识、`initLinks aclick` 伪装跳转广告，以及广告删除后残留的横线和空白占位。
项目仓库：
```text
https://github.com/CX330-YCH/Fuck_Bing_Search_Ad

⸻

AI 项目说明

本项目是一个 AI 辅助开发项目。

项目的实际需求、测试截图、异常页面、广告样本和修复方向由用户提供；脚本实现、规则归纳、版本说明和文档由 AI 辅助完成。

这意味着：

* 项目规则来自真实 Bing 搜索页面测试；
* 代码由 AI 辅助编写，可能仍存在边界问题；
* Bing 页面结构变化后，脚本可能需要继续更新；
* 欢迎通过 Issue 提交截图、DOM 结构、关键词和复现步骤。

⸻

功能特性

* 删除 Bing 顶部广告结果；
* 删除伪装成自然搜索结果的广告；
* 删除 MSAN 嵌入式广告；
* 识别 initLinks(..., bing.com/aclick...) 伪装广告跳转；
* 识别 p::before 形式的广告徽标；
* 删除广告残留横线；
* 删除空广告外壳和空白广告占位；
* 隐藏顶部广告区 #b_topw::before / #b_topw::after 伪元素残留分割线；
* 支持 Bing Ajax 翻页后的二次清理；
* 支持全广告空结果页自动跳页；
* 支持 Log 面板；
* 支持广告命中统计 / 清理动作统计；
* 支持性能优化开关；
* 支持重置统计数据。

⸻

适配范围

当前主要适配以下页面：

https://www.bing.com/search*
https://cn.bing.com/search*
https://bing.com/search*

当前已处理过的广告类型包括：

类型    说明
b_ad    Bing 传统广告容器
AdSlug / acf-badge    Bing 广告标识结构
MSAN    Microsoft Advertising Network 嵌入广告
p.b_lineclamp::before    伪元素广告徽标
initLinks aclick    表面自然结果、实际绑定 Bing 广告跳转的伪装广告
b_results_lsep / adstop    广告区域残留分割线
#b_topw::before / ::after    顶部广告区伪元素残留线
空广告页    删除后无自然结果时自动跳页

⸻

安装方式

方式一：从 GitHub Raw 安装

安装 Tampermonkey / 油猴后，打开下面的 Raw 地址：

https://raw.githubusercontent.com/CX330-YCH/Fuck_Bing_Search_Ad/main/Fuck_Bing_Search_Ad.user.js

浏览器会唤起用户脚本管理器，确认安装即可。

注意：仓库中的脚本文件名建议保持为 Fuck_Bing_Search_Ad.user.js。
如果文件名不一致，@updateURL 和 @downloadURL 的自动更新地址可能失效。

⸻

方式二：从 Greasy Fork 安装

发布到 Greasy Fork 后，将链接填写到这里：

https://greasyfork.org/scripts/你的脚本地址

Greasy Fork 会读取用户脚本头部元数据，例如 @name、@version、@description、@license 等。发布到 Greasy Fork 的代码应保持可读，不建议压缩或混淆。

⸻

使用方式

安装脚本后，打开 Bing 搜索页即可自动运行。

脚本提供以下 Tampermonkey / 油猴菜单：

* 开启 / 关闭 Log 面板；
* 开启 / 关闭性能优化；
* 开启 / 关闭自动跳过空广告页；
* 重置广告统计。

⸻

性能影响提示

本脚本不是单纯修改 URL 参数的轻量脚本，而是会在页面加载后对 Bing 搜索结果进行广告结构识别和 DOM 清理。因此它可能对页面性能产生影响。

可能出现的表现：

* 页面刚加载时广告短暂出现，随后被删除；
* 点击翻页后有短暂卡顿；
* Bing Ajax 加载新结果时会短暂等待扫描；
* 广告较多的页面清理时间更长；
* 开启 Log 面板后，右侧日志更新会增加额外 DOM 操作；
* 低性能设备或浏览器插件较多时，卡顿更明显。

主要性能开销来自：

1. 多组 querySelectorAll DOM 扫描；
2. MutationObserver 监听页面动态变化；
3. 读取 p::before 伪元素样式；
4. 扫描页面脚本中的 Bing 广告初始化信息；
5. 删除广告节点后的空壳、分隔线和占位清理；
6. Log 面板的实时 DOM 更新；
7. 自动跳页时对自然结果数量和页面状态的判断。

建议设置：

* 日常使用：开启“性能优化”；
* 日常使用：关闭 Log 面板；
* 排查问题：临时开启 Log 面板；
* 如果感觉翻页卡顿：关闭自动跳过空广告页后再测试；
* 如果设备性能较弱：减少同时开启的广告拦截类扩展；
* 如果只想要极致轻量体验，可以考虑只使用 URL 参数清理类脚本，但过滤能力会明显弱于本项目。

本项目会尽量在过滤能力和性能之间取平衡，但无法保证完全无感运行。

⸻

Log 面板说明

开启 Log 面板后，页面右侧会显示脚本运行状态，包括：

* 扫描次数；
* 删除数量；
* 性能优化状态；
* 自动跳页状态；
* 本页广告命中统计；
* 本页清理动作统计；
* 累计广告命中统计；
* 累计清理动作统计；
* 每条删除规则的命中原因。

日常使用建议关闭 Log 面板，以减少页面重排和 DOM 更新带来的性能开销。

⸻

统计分类

脚本将统计分为两类：

广告命中统计

表示脚本真正识别到了广告结构，例如：

* Bing 原生广告结果块；
* initLinks aclick 伪装广告；
* MSAN 嵌入式广告；
* AdSlug / acf-badge 广告标识；
* 传统 b_ad 广告容器；
* 伪元素广告徽标。

清理动作统计

表示广告删除后的善后处理，例如：

* 顶部残留分隔线清理；
* 空广告外壳清理；
* 空白 WPT / slide 占位清理；
* WPT / slide 残留广告清理；
* 自动跳过空广告页。

⸻

性能说明

脚本包含多种广告识别规则，因此相比简单的 URL 参数清理脚本，功能更完整，但也会有一定运行成本。

相对耗性能的操作包括：

1. 读取 p::before 伪元素样式；
2. 扫描 Bing 页面脚本中的广告初始化信息；
3. 多组 DOM 选择器扫描；
4. MutationObserver 监听 Ajax 翻页；
5. Log 面板 DOM 更新。

因此建议：

* 日常关闭 Log 面板；
* 保持性能优化开启；
* 只有排查问题时再打开 Log 面板；
* 遇到漏删广告时，提供截图和 DOM 结构辅助定位。

⸻

已知限制

由于 Bing 页面结构会不断变化，本脚本不能保证永久有效。

可能出现的问题包括：

* 某些新广告结构无法识别；
* 某些广告会先短暂出现再被删除；
* Bing Ajax 翻页后需要延迟扫描；
* 特殊结果块可能需要额外适配；
* Greasy Fork 发布后，更新地址可能由 Greasy Fork 接管；
* 在广告较多、页面结构复杂或设备性能较弱时，可能出现短暂卡顿。

⸻

文件结构建议

Fuck_Bing_Search_Ad/
├── Fuck_Bing_Search_Ad.user.js
├── README.md
├── CHANGELOG.md
└── LICENSE

⸻

版本更新建议

每次更新脚本时，请同步修改脚本头部版本号：

// @version      1.0.x

建议版本规则：

版本类型    示例    说明
修复小问题    1.0.1    修复漏删、误删、样式残留等问题
新增功能    1.1.0    新增规则、开关、统计能力
大重构    2.0.0    规则体系或架构发生明显变化

⸻

反馈问题

如果遇到漏删、误删或明显卡顿，建议在 Issue 中提供：

* 搜索关键词；
* Bing 页面链接；
* 页面截图；
* 对应 DOM 结构；
* 是否开启 Log；
* Log 输出内容；
* 浏览器版本；
* Tampermonkey / 油猴版本；
* 是否开启性能优化；
* 是否开启自动跳过空广告页；
* 卡顿出现的场景，例如首次搜索、刷新、翻页或连续自动跳页。

Issue 地址：

https://github.com/CX330-YCH/Fuck_Bing_Search_Ad/issues

⸻

免责声明

本项目仅用于个人学习、研究和改善搜索体验。

本项目不隶属于 Microsoft、Bing、Greasy Fork、Tampermonkey 或任何广告平台。
脚本效果取决于 Bing 当前页面结构和浏览器环境。
使用者需自行承担使用脚本带来的风险。

⸻

License

MIT License
