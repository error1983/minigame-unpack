const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createHash } = require('crypto');
const readline = require('readline');
const zlib = require('zlib');
const { promisify } = require('util');
const { unpack_tpkg } = require('./ttks_unpack.js');

const zstdDecompress = promisify(zlib.zstdDecompress);

const metaFileUrl = 'https://api5-normal-lf.amemv.com/mgplatform/api/apps/v3/meta?version=current&bdp_sdk_version=16.0.1&ttcode=O5LI3hoiuj2CNZMyIV2D24%252FERIXpVCf9%252Fw7AIxveXBZKOoiS3PEYmbnUUVnR5acwrxl1CVC6wTVnQg7DkkaqAJeV0cz8ao1N7c3bxbYokkHzYE8k3P%252BQe3k2rTqSm2yrZmUJiC9sdkp0h6ArOjaYa%252BwtSmZ3Otua4WRLabYufv4%253D&is_sttpkg=1&appid=';
const searchUrl = 'https://game-distribution.zijieapi.com/ttgame/gutenberg/game_center/search?device_id=1918024399236063&device_platform=android&os_version=14&version_code=350500&query=';

// 创建 readline 接口
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

// 封装提问函数（Promise 化）
function ask(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
}

async function decompress(buffer) {
    return zstdDecompress(buffer);
}

async function downloadFile(url) {
    try {
        console.log(`开始下载: ${url}`);
        const response = await axios.get(url, {
            responseType: 'arraybuffer'
        });

        let buffer = Buffer.from(response.data);
        console.log(`下载完成: ${url}, 文件大小: ${buffer.length} 字节`);

        // 检查文件头来判断是否需要解压
        if (buffer.length >= 4) {
            const header = buffer.subarray(0, 4).toString();
            // console.log('文件头:', header);

            // 如果是 SPKG 格式，需要移除前12字节并解压Zstd数据
            if (header === 'SPKG') {
                // console.log('检测到 SPKG 格式，开始处理...');
                if (buffer.length > 12) {
                    const rawData = buffer.subarray(12); // 移除前12字节
                    // console.log(`移除头部后数据大小: ${rawData.length} 字节`);

                    // 打印前几个字节用于调试
                    // console.log('SPKG 原始数据前32字节 HEX:', rawData.subarray(0, 32).toString('hex'));

                    // 直接使用 zstd 解压
                    try {
                        // console.log('开始 zstd 解压...');
                        const originalSize = rawData.length;
                        buffer = await decompress(rawData);
                        // console.log(`zstd 解压成功: ${originalSize} -> ${buffer.length} 字节`);
                    } catch (zstdError) {
                        // console.error('zstd 解压失败:', zstdError.message);

                        // 作为备用方案，保存原始数据并记录警告
                        // console.warn('zstd 解压失败，使用原始数据。这可能意味着数据格式不兼容或已损坏。');
                        buffer = rawData;
                    }
                }
            }
            // TPKG 格式保持原样
        }

        return buffer;

    } catch (err) {
        console.error('下载失败:', err.message);
        throw err;
    }
}


async function searchGame(query) {
    if (!query) {
        return [];
    }

    const response = await axios.get(searchUrl + query);
    const data = response.data;
    const games = data.data?.games?.filter(game => game.type === 2) ?? [];
    return games.map(game => {
        return {
            appId: game.micro_game?.game_id,
            name: game.micro_game?.game_name ?? '未知游戏',
            icon: game.micro_game?.icon,
            introduction: game.micro_game?.introduction,
        };
    });
}

function getMD5Hash(url) {
    return createHash('md5').update(url).digest('hex').substring(0, 8);
}

function getExtensionFromURL(url) {
    const extRegex = /\.([a-zA-Z0-9]+)(?=\?|$)/;
    const match = url.match(extRegex);
    return match ? match[1] : 'bin';
}

async function fetchMetaFile(gameId, metaUrl = null) {
    const fileUrl = `${metaFileUrl}${gameId}`;
    // 直接从 URL 获取 JSON 数据
    try {
        const response = await axios.get(fileUrl);
        return response.data;
    } catch (err) {
        console.error('Download meta file error:', err.message);
        return null;
    }
}


async function downloadGame(gameId) {
    try {
        // 首先获取游戏信息以获取游戏名
        const json = await fetchMetaFile(gameId);
        if (!json) {

            return false;
        }

        const appid = json.data.appid;
        const appName = json.data.name;

        // 清空并创建目标目录
        if (fs.existsSync(appid)) {
            fs.rmSync(appid, { recursive: true });
        }
        fs.mkdirSync(appid, { recursive: true });

        // 保存 .meta 文件到目标目录
        const metaPath = path.join(appid, '_.meta');
        await fs.promises.writeFile(metaPath, JSON.stringify(json, null, 2));

        let packages = [];
        let plugins = [];

        // 优先使用压缩版本
        if (json.data.packages) {
            packages = Object.values(json.data.packages).map(item => item.path[0]);
        } else if (json.data.backup_packages) {
            packages = Object.values(json.data.backup_packages).map(item => item.path[0]);
        } else {
            console.error('No packages found in the meta file.');
            fs.rmSync(appid, { recursive: true });
            return false;
        }

        // 插件也一样处理
        if (json.data.plugins) {
            plugins = Object.values(json.data.plugins).map(item => item.path[0]);
        } else if (json.data.backup_plugins) {
            plugins = Object.values(json.data.backup_plugins).map(item => item.path[0]);
        }

        const iconUrl = json.data.icon;

        // 下载图标
        if (iconUrl) {
            try {
                const iconBuffer = await downloadFile(iconUrl);
                const ext = getExtensionFromURL(iconUrl);
                const iconPath = path.join(appid, `icon.${ext}`);
                await fs.promises.writeFile(iconPath, iconBuffer);
                console.log(`The icon has been saved to ${iconPath}`);
            } catch (err) {
                console.error('下载图标失败:', err.message);
            }
        }

        // 下载 packages
        for (const url of packages) {
            try {
                const buffer = await downloadFile(url);
                const md5 = getMD5Hash(url);
                const pkgPath = path.join(appid, `${md5}.pkg`);
                await fs.promises.writeFile(pkgPath, buffer);
                console.log(`The package has been saved to ${pkgPath}`);
            } catch (err) {
                console.error('下载游戏资源包失败:', err.message);
            }
        }

        // 下载 plugins
        for (const url of plugins) {
            try {
                const buffer = await downloadFile(url);
                const md5 = getMD5Hash(url);
                const pluginPath = path.join(appid, `${md5}.pkg`);
                await fs.promises.writeFile(pluginPath, buffer);
                console.log(`The plugin has been saved to ${pluginPath}`);
            } catch (err) {
                console.error('下载插件失败:', err.message);
            }
        }
        console.log('All files have been downloaded and saved successfully.');

        return true;

    } catch (err) {
        console.error('The game installation failed:', err.message);
        if (fs.existsSync(gameId)) {
            fs.rmSync(gameId, { recursive: true });
        }
        return false;
    }
}

async function unpack_app(appdir) {
    const outputDir = path.join(appdir, 'unpacked');
    if (!fs.existsSync(appdir)) {
        console.error(`The directory ${appdir} does not exist.`);
        return false;
    }
    const files = fs.readdirSync(appdir).filter(file => file.endsWith('.pkg'));
    if (files.length === 0) {
        console.error(`No .pkg files found in ${appdir}.`);
        return false;
    }
    for (const file of files) {
        const filePath = path.join(appdir, file);
        await unpack_tpkg(filePath, outputDir);
    }

    const icon = fs.readdirSync(appdir).find(file => file.startsWith('icon.'));
    if (icon) {
        fs.copyFileSync(path.join(appdir, icon), path.join(outputDir, icon));
    } else {
        const isMeta = fs.existsSync(path.join(appdir, '_.meta'));
        if (isMeta) {
            const meta = JSON.parse(fs.readFileSync(path.join(appdir, '_.meta'), 'utf8'));
            const iconUrl = meta.data.icon;
            if (iconUrl) {
                const ext = getExtensionFromURL(iconUrl);
                const iconPath = path.join(outputDir, `icon.${ext}`);
                try {
                    const iconBuffer = await downloadFile(iconUrl);
                    await fs.promises.writeFile(iconPath, iconBuffer);
                    console.log(`The icon has been saved to ${iconPath}`);
                } catch (err) {
                    console.error('下载图标失败:', err.message);
                }
            }
        }
    }

    return true;
}

async function download() {
    try {
        // ========== 1. 搜索游戏 ==========
        const keyword = await ask('🔍 请输入要搜索的游戏名称: ');
        if (!keyword) {
            console.log('❌ 关键词不能为空');
            await ask('\n请按回车键继续...');
            return;
        }

        console.log(`⏳ 正在搜索 "${keyword}"...`);
        const games = await searchGame(keyword);

        if (!games || games.length === 0) {
            console.log('😅 未找到相关游戏');
            await ask('\n请按回车键继续...');
            return;
        }

        // ========== 2. 展示游戏列表 ==========
        console.log('\n📋 搜索结果:');
        console.log('─'.repeat(50));
        games.forEach((game, index) => {
            console.log(`  [${index + 1}] ${game.name} ${game.appId}  (游戏简介: ${game.introduction})`);
        });
        console.log('─'.repeat(50));

        // ========== 3. 用户选择并下载 ==========
        while (true) {
            const input = await ask(`\n请选择要下载的游戏编号 (1-${games.length}，输入 q 退出): `);

            if (input.toLowerCase() === 'q') {
                console.log('👋 已退出');
                break;
            }

            const num = parseInt(input, 10);
            if (isNaN(num) || num < 1 || num > games.length) {
                console.log(`⚠️  请输入 1~${games.length} 之间的有效编号`);
                continue;
            }

            const selected = games[num - 1];
            console.log(`\n⬇️  开始下载: ${selected.name} (${selected.appId})`);
            await downloadGame(selected.appId);
            console.log(`✅ "${selected.name}" 下载完成！\n`);
            const isUnPack = await ask('是否解包游戏资源？(y/n): ');
            if (isUnPack.toLowerCase() === 'y') {
                await unpack_app(selected.appId);
                console.log(`✅ "${selected.name}" 解包完成！\n`);
            }
            await ask('\n请按回车键继续...');
            break; // 下载成功后退出循环；如需连续下载可去掉此行
        }
    } catch (err) {
        console.error('💥 发生错误:', err.message);
        await ask('\n请按回车键继续...');
    } finally {
        rl.close();
    }
}

async function main() {
    const cmd = process.argv[2];
    if (cmd === '--search' || cmd === '-s') {
        await download();
        process.exit(0);
    } else if (cmd === '--unpack-app' || cmd === '-a') {
        const appId = process.argv[3];
        if (!appId) {
            console.error('请指定要解包的游戏目录');
            process.exit(1);
            return;
        }
        await unpack_app(appId);
        console.log(`✅ "${appId}" 解包完成！\n`);
        process.exit(0);
    } else if (cmd === '--unpack-pkg' || cmd === '-p') {
        const pkgPath = process.argv[3];
        const outputDir = process.argv[4];
        if (!pkgPath || !outputDir) {
            console.error('请指定要解包的pkg文件路径和输出目录');
            process.exit(1);
            return;
        }
        await unpack_tpkg(pkgPath, outputDir);
        console.log(`✅ "${pkgPath}" 解包完成！\n`);
        process.exit(0);
    } else {
        console.log('用法:');
        console.log('Usage: node main.js -s 搜索游戏');
        console.log('Usage: node main.js --search 搜索游戏');
        console.log('Usage: node main.js -a [appDir] 解包游戏目录');
        console.log('Usage: node main.js --unpack-app [appDir] 解包游戏目录');
        console.log('Usage: node main.js -p [pkgPath] [outputDir] 解包pkg文件');
        console.log('Usage: node main.js --unpack-pkg [pkgPath] [outputDir] 解包pkg文件');
        process.exit(1);
        return;
    }
}

main().catch(err => {
    console.error('💥 发生错误:', err.message);
    process.exit(1);
}).finally(() => {
    rl.close();
});