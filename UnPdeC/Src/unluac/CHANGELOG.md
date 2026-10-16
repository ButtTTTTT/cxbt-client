# unluac 更改记录

基于 unluac v1.2.3.530，针对 FCSRC 项目（1.0.6.8166 客户端 Lua 5.1 字节码）的反编译需求进行定制修复。

---

## 修改文件清单

| 文件 | 修改类型 |
|------|---------|
| `src/unluac/Main.java` | 增强功能 |
| `src/unluac/decompile/Decompiler.java` | Bug 修复 |
| `src/unluac/decompile/statement/Assignment.java` | Bug 修复 + 增强功能 |
| `src/unluac/decompile/expression/ClosureExpression.java` | 无修改（endfunction 问题在 Assignment 层修复） |

---

## 一、Main.java — 文件输入增强

### 1. 自动跳过自定义文件头（Skip 8 bytes）

**问题**：8166 客户端编译产生的 `.luac` 文件带有 8 字节的自定义文件头（前 4 字节为 `01 0A 00 00`），标准 Lua 5.1 字节码签名（`1B 4C 75 61`）从第 9 字节开始。原版 unluac 无法识别此格式。

**修复**：在 `file_to_function()` 中增加自动检测——读取前 8 字节，若匹配 `01 0A 00 00` 大端序标记则跳过 8 字节后解析，否则从文件头开始正常解析。

**输出**：跳过时打印 `"Skip 8 bytes"` 提示信息。

### 2. 自动输出到同目录同名 .lua 文件

**问题**：原版 unluac 仅输出到 stdout，批量反编译时不便。

**修复**：当未指定 `--output` 参数时，自动将输入文件路径中的 `.luac` 扩展名替换为 `.lua`（去掉末尾的 `c`）作为输出文件路径，并在同目录生成。打印 `"OutPutFile: <path>"` 提示。

---

## 二、Decompiler.java — 寄存器残留值检测与清除

### 3. 局部变量声明时残留值替换为 nil

**根因分析**：

8166 版本的 Lua 5.1 编译器对 `local function f()` 的编译存在以下优化行为：

```
源码:                        字节码PC:
local skin_mouse = expr      PC=185: NEWTABLE r11   ← 覆盖了 r11
local function f()           PC=198: CLOSURE r11, f0 ← f 的闭包
```

- `local function f()` 在调试信息中的 `begin` PC（如 PC=197）晚于 CLOSURE 指令的实际 PC（如 PC=85 或 PC=198 附近）
- 在 CLOSURE 指令与变量声明 begin PC 之间，该寄存器（r11）会被其他指令（NEWTABLE、LOADK 等）覆盖
- 当 unluac 在 PC=begin 处收集 `newLocals` 时，`getValue(register, begin+1)` 返回的是寄存器残留值（如 TableLiteral），而非正确的闭包值

这导致反编译输出如：
```lua
local skin_mouse, ChangeAudioOff = Gui.ControlSkin({...}), {BackgroundImage = ...}
-- ChangeAudioOff 得到的是 newtable 的残留表字面量，而非闭包
```

**修复**：在 `processSequence()` 收集 `newLocals` 并添加到 `Assignment` 时（原第 999 行），增加残留值检测：

```java
Expression declValue = r.getValue(decl.register, line + 1);
int declUpdated = r.getUpdated(decl.register, line - 1);
if (!declValue.isNil() && !declValue.isClosure() && declUpdated < decl.begin) {
    declValue = ConstantExpression.createNil(line);
}
```

**判断逻辑**：若局部变量的寄存器最后一次被 `setValue` 更新的 PC（`declUpdated`）早于变量声明的 begin PC，且当前值既不是 nil 也不是闭包，则该值是编译器优化导致的寄存器残留，用 nil 替代。

**效果**：
```lua
-- 修复前:
local skin_mouse, ChangeAudioOff = Gui.ControlSkin({...}), {垃圾表}

-- 修复后:
local skin_mouse = Gui.ControlSkin({...})
local ChangeAudioOff   ← nil 值不输出 "= nil"
```

---

## 三、Assignment.java — 多目标声明拆分与 function sugar 修复

### 4. 合并 local 声明中包含闭包时拆分输出

**问题**：`local a, b = function()...end, val` 合并输出在 Lua 中是合法语法，但语义不直观且容易产生错误。

**修复**：新增 `shouldSplitForClosure()` 方法，当 `declare=true` 且多目标声明中任一 value 是闭包时触发拆分。拆分后对闭包使用 `local function name()...end` 语法糖，其余值正常输出。

```lua
-- 修复前:
local a, b = function()...end, val

-- 修复后:
local function a()
  ...
end
local b = val
```

### 5. 混合 local / non-local 目标时拆分输出

**问题**：`local ui.xxx.Maximum, SafeSetCBX = 95, ui.xxx` 在 Lua 中是语法错误——`local` 关键字不能修饰表属性目标 `ui.xxx.Maximum`。

**修复**：新增 `shouldSplitForMixedTargets()` 方法，当 `declare=true` 且多目标声明中同时存在 `isLocal()` 和非 `isLocal()` 的 target 时触发拆分。

```lua
-- 修复前:
local ui.sld_miaozhunjing_sensitivity.Maximum, SafeSetCBX = 95, ui.sld_miaozhunjing_sensitivity
-- ↑ 语法错误

-- 修复后:
ui.sld_miaozhunjing_sensitivity.Maximum = 95
local SafeSetCBX = ui.sld_miaozhunjing_sensitivity
```

### 6. 过剩值（excess values）检测与拆分

**问题**：当 `values.size() > targets.size()` 或某些 target 的 value 是 `LocalVariable` 引用时，说明编译器将不同来源的值错误合并到同一声明中。

**修复**：新增 `shouldSplitForExcessValues()` 方法，检测两种情况：
- 值数量多于目标数量（`values.size() > targets.size()`）
- 某个 target 的 value 是 `LocalVariable` 类型（引用另一个局部变量），在多目标声明中属于可疑的寄存器残留

### 7. 混合 nil / non-nil 目标时拆分输出

**问题**：当残留值被替换为 nil 后（见修复 #3），多目标声明变为 `local a, b = expr`（b 得到 nil），输出不够清晰。

**修复**：新增 `shouldSplitForNilTargets()` 方法，当 `declare=true` 且多目标声明中同时存在 nil（非显式 nil 常量）和非 nil 值时触发拆分。

```lua
-- 修复前:
local skin_mouse, ChangeAudioOff = Gui.ControlSkin({...})

-- 修复后:
local skin_mouse = Gui.ControlSkin({...})
local ChangeAudioOff
```

### 8. function sugar 条件放宽

**问题**：原版 `canUseFunctionSugar()` 要求 `declareStart >= closure.closureUpvalueLine()`，但 8166 编译器优化后 CLOSURE 指令的 PC 可能远早于 `declareStart`（变量声明 begin PC），导致合法的 `local function f()` 无法使用语法糖，被输出为 `local f = function()...end`。

**修复**：在 `canUseFunctionSugar()` 中增加前置判断——当 `declare=true` 且 `target.isLocal()` 时，直接返回 `true`，跳过严格的 `declareStart` 比较。

**同时重构**：将 `print()` 方法中内联的 function sugar 判断逻辑提取为对 `canUseFunctionSugar()` 的调用，消除代码重复。

### 9. endfunction 粘连修复

**问题**：`ClosureExpression.printMain()` 在输出 `end` 时使用 `out.print("end")`（不换行），当连续两个闭包声明时产生 `endfunction` 粘连：
```lua
function SpawnNewStarControl(index)
  ...
endfunction SpawnControl_2(index)
```

**修复**：在 `Assignment.print()` 的拆分输出路径中，`value.printClosure()` 调用后添加 `out.println()` 确保换行。同时在非拆分路径的 `printClosure` 后添加 `out.paragraph()` 确保段落分隔。

```lua
-- 修复前:
endfunction SpawnControl_2(index)

-- 修复后:
end

function SpawnControl_2(index)
```

---

## 四、拆分决策汇总

`shouldSplitDeclaration()` 综合以下四个条件，任一为 true 即触发拆分输出：

| 方法 | 触发条件 | 修复的问题 |
|------|---------|-----------|
| `shouldSplitForClosure()` | 多目标声明中有闭包值 | `local a, b = function()...end, val` |
| `shouldSplitForMixedTargets()` | 多目标声明中混合 local/non-local | `local ui.xxx.Maximum, SafeSetCBX = ...` |
| `shouldSplitForExcessValues()` | 值多于目标，或 LocalVariable 残留 | `local a, b = expr, <residual>` |
| `shouldSplitForNilTargets()` | 多目标声明中混合 nil/non-nil | `local a, b = expr`（b 得到 nil） |

---

## 五、修复效果对比（settings.lua 示例）

| 原版代码 | 修复前反编译 | 修复后反编译 |
|---------|------------|------------|
| `local skin_mouse = Gui.ControlSkin({...})` | `local skin_mouse, ChangeAudioOff = expr, {垃圾表}` | `local skin_mouse = Gui.ControlSkin({...})` |
| `local function ChangeAudioOff(c)` | `local ChangeAudioOff = {垃圾表}; local ChangeAudioOff = function(c)` | `local ChangeAudioOff; function ChangeAudioOff(c)` |
| `local function ChangeAudioValue(v)` | `local ChangeAudioValue = Gui.Image(...); local ChangeAudioValue = function(v)` | `local ChangeAudioValue; function ChangeAudioValue(v)` |
| `local function BigTitle(text)` | `local BigTitle = Vector4(0,0,0,0); local BigTitle = function(text)` | `local BigTitle; function BigTitle(text)` |

---

## 六、已知限制

1. `local ChangeAudioOff; function ChangeAudioOff(c)` 与原版 `local function ChangeAudioOff(c)` 语义等价但形式不同——前者在 `local` 声明到 `function` 赋值之间 ChangeAudioOff 为 nil，后者始终为闭包。在正常代码中无实际差异。

2. 残留值检测依赖 `updated[register][PC-1] < decl.begin` 条件，假设编译器不会在变量声明 begin PC 处同时给寄存器赋值。此假设在标准 Lua 5.1 编译器中成立，但在极端优化场景下可能误判。

3. 8 字节文件头检测仅匹配 `01 0A 00 00` 前缀，其他自定义文件头格式需手动跳过。
