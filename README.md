# minigame-unpack (bmu)

抖音小游戏（ByteDance MiniGame）**搜索 / 下载 / 解包** 一站式工具。

支持按名称搜索小游戏中心里的游戏，下载其 `TPKG` 资源包，并解密还原出原始的游戏代码与资源文件（含 `.js` 代码的 `__tt_define__` 还原与格式化）。

## 功能特性

- 🔍 **在线搜索**：通过关键词搜索抖音小游戏中心，列出候选游戏（appId / 名称 / 简介）供选择
- ⬇️ **一键下载**：拉取游戏 meta 信息、图标、packages、plugins，自动处理 `SPKG`（Zstd 压缩）格式
- 🔓 **TPKG 解包**：解析 `TPKG` 包格式，使用 WASM 模块（`decMiniGame`）+ 包内 `__ttks` 密钥逐块解密文件索引与内容
- 🧹 **代码还原**：对解密出的 `.js` 通过 Babel AST 还原 `__tt_define__` 包装（参数名还原 + 提取真实函数体），输出可读代码
- 📦 **单文件可执行程序**：提供基于 Node SEA 的打包脚本，构建出免依赖的 `bmu.exe` / `bmu`

## 环境要求

- Node.js **≥ 22**（`zlib.zstdDecompress` 需要较新的 Node 版本）
- WASM 模块：`encMiniGame.wasm`（内嵌在 `encMiniGame.js` 运行时自动加载）

## 安装

```bash
git clone https://github.com/liumou321/minigame-unpack.git
cd minigame-unpack
npm install
```

## 使用方法

### 1. 交互式搜索 + 下载 + 解包

```bash
node main.js --search
# 或
node main.js -s
```

按提示输入游戏名称 → 从结果列表选择编号 → 自动下载到 `<appId>/` 目录 → 可选择立即解包。

### 2. 解包整个游戏目录

```bash
node main.js --unpack-app <appId目录>
# 或
node main.js -a <appId目录>
```

遍历目录下的所有 `.pkg` 文件，逐个解包到 `<appId目录>/unpacked/`。

### 3. 解包单个 pkg 文件

```bash
node main.js --unpack-pkg <xxx.pkg> <输出目录>
# 或
node main.js -p <xxx.pkg> <输出目录>
```

### 输出目录结构

```
<appId>/
├── _.meta              # 游戏 meta 信息（含包地址、图标等）
├── icon.png            # 游戏图标
├── <md5>.pkg           # 下载到的资源包 / 插件包
└── unpacked/           # 解包输出目录
    ├── game.js         # 已解密并还原参数的代码
    ├── ...
    └── assets/         # 其余资源文件
```

## 构建单文件可执行程序

Windows（PowerShell）：

```powershell
.\build.ps1
# 输出: .\dist\bmu.exe
```

Linux / macOS：

```bash
./build.sh
# 输出: ./dist/bmu
```

构建流程：`npm ci`/`npm install` 还原依赖 → `esbuild` 打包 `main.js` → `node --experimental-sea-config` 生成 SEA blob → 复制 node 二进制 → `postject` 注入 blob。

> 注意：`encMiniGame.wasm` 已打包进可执行程序运行时，无需另外提供。

## 项目结构

```
.
├── main.js            # CLI 入口：搜索 / 下载 / 解包命令
├── ttks_unpack.js     # TPKG 格式解析 + WASM 解密 + 文件还原
├── encMiniGame.js     # Emscripten 生成的 WASM 运行时（decMiniGame 解密实现）
├── tt.js              # Babel AST 处理：还原 __tt_define__ 包装的 JS 代码
├── build.ps1          # Windows 下单文件构建脚本（Node SEA）
├── build.sh           # Linux/macOS 下单文件构建脚本（Node SEA）
└── sea-config.json    # Node SEA 配置
```

## 技术说明

- **包格式**：`.pkg` 文件以 `TPKG` 魔数开头，头部含版本、元数据块（`JSON{...}`，内含 32 字节 `__ttks` 密钥），随后为加密的文件索引与各文件数据块
- **解密**：通过 Emscripten WASM 模块导出的 `_decMiniGame(in, len, out, outLen, keyPtr)` 对索引与内容分块解密
- **下载压缩**：下载文件若为 `SPKG` 格式，去掉 12 字节头后使用 Zstd 解压
- **代码还原**：`__tt_define__(name, function(...))` 形式的入口，会按注入顺序还原参数名（`require`、`module`、`exports`、`GameGlobal` 等）并提取函数体后重新生成代码

## 免责声明

本工具仅供学习研究与安全技术交流。请勿用于任何商业或侵权用途，下载、解包及使用他人游戏资源所产生的全部法律责任由使用者自行承担。
