const { default: generator } = require('@babel/generator');
const type = require('@babel/types');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const injectables = [
    'require',
    'module',
    'exports',
    'Function',
    'Promise',
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'GameGlobal',
    'top',
    'parent',
    'open',
    'TmarGlobal',
];

function processFileTT(rawCode) {
    const ast = parse(rawCode);

    // === 第一步：参数还原 + 引用替换（使用 scope.rename）===
    traverse(ast, {
        CallExpression(path) {
            if (path.node.callee.name === '__tt_define__') {
                const args = path.node.arguments;

                if (args.length > 1 && type.isFunctionExpression(args[1])) {
                    const funcExpr = args[1];

                    if (args[0].value === 'game.js')
                        console.log(`Renamed parameters in function: ${funcExpr.id ? funcExpr.id.name : 'anonymous'}`);
                    // 获取原参数名列表
                    const oldParams = funcExpr.params.map(p => p.name);
                    path.scope.traverse(path.node, {
                        enter(path) {
                            if (path.scope.block === funcExpr) {
                                oldParams.forEach((oldName, index) => {
                                    const newName = injectables[index];
                                    if (newName) {
                                        path.scope.rename(oldName, newName);
                                    }
                                });
                                path.stop(); // 停止遍历，避免进一步处理
                            }
                        }
                    });

                    path.stop(); // 停止遍历，避免进一步处理
                }
            }
        },
    });

    // === 第二步：提取函数体并删除 __tt_define__ 调用 ===
    traverse(ast, {
        CallExpression(path) {
            if (path.node.callee.name === '__tt_define__') {
                const args = path.node.arguments;

                if (args.length > 1 && type.isFunctionExpression(args[1])) {
                    const funcExpr = args[1];
                    const bodyStatements = funcExpr.body.body;

                    // 清空原始程序体内容
                    ast.program.body = [];

                    // 将函数体内容添加到程序体中
                    ast.program.body.push(...bodyStatements);
                }
            }
        },
    });

    // === 第三步：生成新代码 ===
    const outputCode = generator(ast).code;

    return outputCode;
}

module.exports = { processFileTT };