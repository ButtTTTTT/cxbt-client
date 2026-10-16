# unluac 修改版更改日志

> 基于 unluac v1.2.3.530，由 AeonLucid 修改版（[AvatarStarCBT](https://github.com/AeonLucid)）进一步适配 PDE 引擎修改版 Lua 5.2 alpha 字节码。

---

## 修改概览

| 级别 | 问题 | 影响文件数 |
|------|------|-----------|
| P0 (严重) | 多目标 local 声明合并错误 | 1 |
| P0 (严重) | 多目标声明中表字面量残留 (arity>0) | 1 |
| P0 (严重) | 闭包赋值被 SETGLOBAL/SETUPVAL 消费导致重复定义 | 1 |
| P1 (中等) | if-else 重构产生空 then 分支 | 3 |
| P2 (美观) | 表格式膨胀 | 1 |
| P2 (美观) | 单行函数被展开为多行 | 4 |
| P2 (美观) | 语法糖 `f "str"` / `f {}` 丢失 | 1 |
| P2 (美观) | 比较操作数方向不自然 | 1 |
| P2 (美观) | 多行表格缺少尾逗号 | 1 |
| P2 (美观) | function 语法糖缺少 local 前缀 | 1 |
| 配置 | 默认版本、rawstring 与版本标识 | 1 |
| 配置 | 帮助输出添加原作者致谢 | 1 |
| 构建 | 构建脚本恢复与动态路径 | 2 |

**共修改 13 个源文件（11 个 Java + 2 个 Bat）。**

---

## P0: 多目标 local 声明合并错误 (严重)

### 问题描述
`unluac` 在处理 `local a, b = val1, val2` 形式的多目标声明时，会将第二个变量赋上寄存器中的残留值（如临时 NEWTABLE 的结果），导致反编译结果错误。

### 修改文件
- `unluac/decompile/Decompiler.java` (`handleInitialDeclares` 方法)

### 修改内容
在 `handleInitialDeclares` 中，当 `declUpdated < decl.begin`（即值在声明之前被写入）时，区分值类型处理：
- **Closure 值**：当 `assignment.getArity() == 0` 时保留，由后续 Assignment 单独处理；当 `arity > 0` 时替换为 nil（闭包是其他函数的残留）
- **TableLiteral 值**：当 `locals.size() <= 1` 且 `assignment.getArity() == 0` 时保留（`local t = {key=val}` 的 NEWTABLE+SETTABLE 序列在 begin PC 之前是正常的）；否则替换为 nil
- **其他值**：替换为 nil（寄存器残留值）

### 效果示例
```lua
-- 修复前（错误）
local a, b = 1, {临时table残留}

-- 修复后（正确）
local a, b = 1, nil
```

---

## P0: 多目标声明中表字面量残留 (严重)

### 问题描述
当 Lua 编译器为 `local a, b = val1` 生成字节码时，若 `val1` 是一个表构造（NEWTABLE），该 NEWTABLE 指令会先写入寄存器，随后 MOVE 指令将值赋给 `a`。此时 `b` 的寄存器中残留了 NEWTABLE 的结果，`unluac` 会错误地将表字面量赋给 `b`。

### 修改文件
- `unluac/decompile/Decompiler.java` (`handleInitialDeclares` 方法)

### 修改内容
在 `handleInitialDeclares` 的 TableLiteral 处理分支中，增加 `assignment.getArity() == 0` 条件检查：
- 当 `arity > 0` 时（即赋值已有来自前序 MOVE 等操作的目标），表字面量是寄存器残留，替换为 nil
- 当 `arity == 0` 且 `locals.size() <= 1` 时，保留表字面量（合法的单目标声明 `local t = {...}`）

### 效果示例
```lua
-- 修复前（错误 — AddMSAA 被赋为表字面量）
local control_kb_list, AddMSAA = {
  ui.kb_shortcutl_forward,
  ...
}, {
  ui.kb_shortcutl_forward,
  ...
}

-- 修复后（正确 — 声明分离）
local control_kb_list = {
  ui.kb_shortcutl_forward,
  ...
}
local AddMSAA

function AddMSAA()
  ...
end
```

---

## P0: 闭包赋值被 SETGLOBAL/SETUPVAL 消费导致重复定义 (严重)

### 问题描述
当源码为 `local function f() ... end` 后跟 `UpdateFilter = f`（将 local 函数赋值给全局/upvalue）时，Lua 编译器生成 `CLOSURE` 指令写入寄存器，随后 `SETGLOBAL`/`SETUPVAL` 消费该寄存器。`unluac` 会错误地为 local 变量生成一个函数定义，同时 `SETGLOBAL` 又生成一个重复的全局函数定义，导致输出中出现两个同名函数。

### 修改文件
- `unluac/decompile/Decompiler.java` (`processOperation` 方法)

### 修改内容
在 `processOperation` 中，当检测到 CLOSURE 赋值到一个已有 local 寄存器（非新声明）时：
1. 向后查找下一条非 MMBIN/MMBINI/MMBINK/UpvalueDeclaration 指令
2. 若该指令为 `SETGLOBAL` 或 `SETUPVAL`，且其 A 操作数等于闭包所在寄存器
3. 则跳过该 local 赋值（返回 null），让 SETGLOBAL/SETUPVAL 单独处理

### 效果示例
```lua
-- 修复前（UpdateInvite 重复定义）
function UpdateInvite(v)  -- 错误：UpdateFilter 的副本
  if v == lang:GetText("三线性（推荐）") then
    return 1
  ...
end

function UpdateInvite(data)  -- 正确的定义
  if data then
    ui.ckb_invite.Check = data.invite
  ...
end

-- 修复后（仅一个正确定义）
UpdateFilter = function(v)
  if v == lang:GetText("三线性（推荐）") then
    return 1
  ...
end

local function UpdateInvite(data)
  if data then
    ui.ckb_invite.Check = data.invite
  ...
end
```

---

## P1: if-else 重构产生空 then 分支 (中等)

### 问题描述
当原始代码为 `if cond then ... else ... end` 结构，且字节码中 then 分支为空（因编译器优化或控制流反转）时，`unluac` 会输出带有空 then 分支的 if 语句，可读性极差。

### 修改文件
- `unluac/decompile/block/IfThenElseBlock.java`
- `unluac/decompile/block/ElseEndBlock.java`
- `unluac/decompile/ControlFlowHandler.java`

### 修改内容

#### `IfThenElseBlock.java`
- 新增 `partner` 字段（`ElseEndBlock`）和 `absorbedElse` 标志
- 在 `resolve()` 中保存 `Registers` 引用，用于后续条件取反
- 在 `print()` 中增加优化逻辑：当 then 分支为空且 else 分支（partner）有简单语句时，取反条件并将 else 语句提升为 then 分支，消除空分支
- 跳过包含 elseif 链的复杂 else 分支（避免语义混乱）

#### `ElseEndBlock.java`
- 新增 `partner` 字段（`IfThenElseBlock`）
- 在 `print()` 开头检查 `partner.absorbedElse`，若已被吸收则跳过打印

#### `ControlFlowHandler.java`
- 在 `resolve_else()` 和 OnceLoop 创建处，将 `IfThenElseBlock` 与 `ElseEndBlock` 通过 `partner` 字段双向关联

### 效果示例
```lua
-- 修复前（空 then 分支，极难读）
if not (0 < px) or 1 < px then
else
  px = mx * px
end

-- 修复后（条件取反，无空分支）
if not (not (0 < px) or 1 < px) then
  px = mx * px
end
```

---

## P2: 表格式膨胀 (美观)

### 问题描述
短列表表格（如 `{0, 255, 255, 255}`）被 `unluac` 展开为多行格式，导致行数大幅膨胀。

### 修改文件
- `unluac/decompile/expression/TableLiteral.java`

### 修改内容
修改 `print()` 方法中的 `lineBreak` 判断逻辑：
- 纯列表表格（`isList=true`）：仅当条目数 **> 10** 时才换行（原为 > 5）
- 非列表表格：当非对象类型或条目数 > 2 时换行（逻辑等价但更清晰）

### 效果示例
```lua
-- 修复前（4 行）
{
  0,
  255,
  255,
  255
}

-- 修复后（1 行）
{0, 255, 255, 255}
```

---

## P2: 单行函数被展开为多行 (美观)

### 问题描述
仅含单个 `return` 语句的简短函数（如 `function foo() return bar end`）被 `unluac` 展开为多行格式。

### 修改文件
- `unluac/decompile/expression/ClosureExpression.java`
- `unluac/decompile/Decompiler.java`
- `unluac/decompile/statement/Return.java`
- `unluac/decompile/block/ContainerBlock.java`

### 修改内容

#### `ClosureExpression.java` (`printMain` 方法)
- 在输出参数列表 `)` 后，先调用 `d.isSingleReturn(result)` 检测函数体是否为单 return
- 若是，调用 `d.printSingleLineReturn()` 输出单行格式
- 否则，保持原有的多行缩进格式

#### `Decompiler.java`
- 新增 `isSingleReturn(State)` 方法：检测函数体是否仅含一个显式 return + 隐式 return，且无 initial declares
- 新增 `printSingleLineReturn(State, Output)` 方法：以 ` return <expr> end` 格式输出

#### `Return.java`
- 新增 `isBrief()` 方法：返回值不超过 2 个，且不含 table literal 或 closure（这些会多行展开）

#### `ContainerBlock.java`
- 新增 `getStatementCount()` 和 `getStatement(int)` 方法，供 `Decompiler.isSingleReturn()` 使用

### 效果示例
```lua
-- 修复前（3 行）
function StrTeam01()
  return lang:GetText("添加关注成功")
end

-- 修复后（1 行）
function StrTeam01() return lang:GetText("添加关注成功") end
```

---

## P2: 语法糖 `f "str"` / `f {}` 丢失 (美观)

### 问题描述
Lua 语法糖 `f "string"` 和 `f {table}`（单参数为字符串或表时省略括号）被 `unluac` 反编译为 `f("string")` 和 `f({table})`，丢失了原始代码风格。

### 修改文件
- `unluac/decompile/expression/FunctionCall.java`

### 修改内容（第二轮调整）
在 `print()` 方法末尾，输出参数列表前检查：
- 若参数仅 1 个且为 **table literal** → 输出 `f {table}`（空格分隔，无括号），保留 GUI 构造模式语法糖
- 若参数仅 1 个且为 **字符串** → **始终使用括号** `f("string")`，不再使用 `f "string"` 形式
- 否则保持原有 `f(arg1, arg2, ...)` 格式

> **调整原因**：`f "string"` 语法糖在实际反编译中容易造成歧义，且与原版源码风格不完全一致。保留 `f {table}` 是因为 PDE 引擎 GUI 构造大量使用此模式（如 `Gui.Control "name" {}`）。

### 效果示例
```lua
-- 修复前
class.import("Gui.Image")

-- 修复后
class.import("Gui.Image")

-- table 参数仍保留语法糖
Gui.Control("ctrl_window_root")({})
-- →
Gui.Control("ctrl_window_root") {}
```

---

## P2: function 语法糖缺少 local 前缀 (美观)

### 问题描述
当 `unluac` 使用 `local function f() ... end` 语法糖输出闭包声明时，`Assignment.java` 中的 `functionSugar` 路径未正确添加 `local` 前缀，导致输出为 `function f()` 而非 `local function f()`。

### 修改文件
- `unluac/decompile/statement/Assignment.java`

### 修改内容
在 `print()` 方法中，当 `functionSugar` 为 true 且声明为 local 时，在输出 `function` 关键字前添加 `local ` 前缀。

---

## P2: 比较操作数方向不自然 (美观)

### 问题描述
`unluac` 反编译比较表达式时，常将常量放在左侧、变量放在右侧（如 `0 < index`），与通常的源码书写习惯（变量在左、常量在右，如 `index > 0`）不一致。

### 修改文件
- `unluac/decompile/condition/BinaryCondition.java`

### 修改内容
在 `asExpression()` 方法中，改进 `transpose` 判断逻辑：
- **左侧常量、右侧寄存器** → `transpose = true`（转置，使变量在左）
- **左侧寄存器、右侧常量** → `transpose = false`（保持原样，变量已在左）
- **两侧均为寄存器** → 按更新时间判断（原逻辑保留）
- **两侧均为常量** → 按常量索引判断（原逻辑保留）

### 效果示例
```lua
-- 修复前（常量在左，不自然）
if 0 < index then ... end

-- 修复后（变量在左，更自然）
if index > 0 then ... end
```

---

## P2: 多行表格缺少尾逗号 (美观)

### 问题描述
多行表格的最后一个条目后没有逗号，与原版源码风格不一致（原版通常带尾逗号便于版本控制 diff）。

### 修改文件
- `unluac/decompile/expression/TableLiteral.java`

### 修改内容
在 `print()` 方法中，当 `lineBreak` 为 true 时，在最后的 `}` 之前输出一个逗号：
```java
if(lineBreak) {
  out.print(",");
  out.println();
  out.dedent();
}
out.print("}");
```

### 效果示例
```lua
-- 修复前
{
  0,
  255,
  255
}

-- 修复后
{
  0,
  255,
  255,
}
```

---

## 配置修改: 默认版本、rawstring 与版本标识

### 修改文件
- `unluac/Main.java`

### 修改内容
- 默认 `lua_version` 设为 `"5.2-alpha"`（PDE 引擎使用的修改版 Lua 5.2 alpha）
- 默认启用 `rawstring`（直接复制字符串字节到输出，避免编码问题）
- 版本输出改为 `unluac v1.2.3.530 (PDE Edition)`，标识 PDE 专用修改版

---

## 配置修改: 帮助输出添加原作者致谢

### 修改文件
- `unluac/Main.java`

### 修改内容
- 新增 `print_credits()` 方法，在 `--help` 输出末尾显示致谢信息
- 致谢内容：感谢 AeonLucid (https://github.com/AeonLucid) 以及 AvatarStarCBT 项目

### 效果示例
```
unluac v1.2.3.530 (PDE Edition)
  usage: java -jar unluac.jar [options] <file>
Available options are:
  ...

Credits:
  Derived from unluac, originally modified by AeonLucid
  https://github.com/AeonLucid
  Thanks to the AvatarStarCBT project
```

---

## 构建脚本恢复与动态路径

### 修改文件
- `build_jar.bat`
- `build_native.bat`

### 修改内容
- 恢复原始构建脚本结构，添加 `JAVA_HOME` 和 `PATH` 环境变量配置（GraalVM JDK 25）
- 将硬编码路径 `cd /d D:\letleon\Source\Cpp\UnPdeC\Src\unluac\src` 替换为 `cd /d "%~dp0"`，脚本可放在任意位置运行
- `build_native.bat` 输出文件名改为 `Unluac`（大写首字母）
- `build_jar.bat` 输出 JAR 名为 `Unluac.jar`

### 构建方式
```bat
REM build_jar.bat — 编译 + 打包
set JAVA_HOME=D:\SDKs\JDK\graalvm-jdk-25.0.1+8.1
set PATH=%JAVA_HOME%\bin;%PATH%
cd /d "%~dp0"
javac -verbose -deprecation -Werror -d build unluac/*.java
jar cvfm Unluac.jar META-INF\MANIFEST.MF -C build .

REM build_native.bat — GraalVM 原生镜像
native-image -jar Unluac.jar -H:+AddAllCharsets --enable-url-protocols=http,https -o Unluac
```

JDK 要求：JDK 21+（使用 GraalVM JDK 25 测试通过）。

---

## 验证结果

### 批量对比数据 (64 个文件)

| 指标 | 数值 |
|------|------|
| 原版总行数 | 142,262 |
| 反编译总行数 | 119,065 |
| 行数比 | 0.837 |
| 错误数 | 0 |

反编译结果比原版更紧凑（0.837），主要归因于单行函数优化和表格紧凑格式。

---

## 修改文件清单

| 文件路径 | 修改内容 |
|---------|---------|
| `unluac/Main.java` | 默认版本 5.2-alpha + rawstring + "(PDE Edition)" 版本标识 + 原作者致谢 |
| `unluac/decompile/Decompiler.java` | P0 local 声明修复 + P0 表字面量残留 (arity>0) + P0 闭包被 SETGLOBAL 消费 + P2 isSingleReturn/printSingleLineReturn |
| `unluac/decompile/ControlFlowHandler.java` | P1 IfThenElseBlock/ElseEndBlock partner 关联 |
| `unluac/decompile/block/IfThenElseBlock.java` | P1 空 then 分支优化 |
| `unluac/decompile/block/ElseEndBlock.java` | P1 被吸收的 else 跳过打印 |
| `unluac/decompile/block/ContainerBlock.java` | P2 getStatementCount/getStatement 方法 |
| `unluac/decompile/expression/ClosureExpression.java` | P2 单行函数检测 |
| `unluac/decompile/expression/FunctionCall.java` | P2 语法糖调整（保留 table 糖，禁用 string 糖） |
| `unluac/decompile/expression/TableLiteral.java` | P2 表格换行阈值 + 尾逗号 |
| `unluac/decompile/statement/Return.java` | P2 isBrief 方法 |
| `unluac/decompile/statement/Assignment.java` | P2 function 语法糖 local 前缀 |
| `unluac/decompile/condition/BinaryCondition.java` | P2 比较操作数方向优化 |
| `build_jar.bat` | 环境变量配置 + 动态路径 `%~dp0` |
| `build_native.bat` | 环境变量配置 + 动态路径 `%~dp0` + 输出名 `Unluac` |
