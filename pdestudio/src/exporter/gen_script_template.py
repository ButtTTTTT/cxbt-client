#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Studio - gen_xxx.lua 编译脚本模板

生成 gen_xxx.lua 编译驱动脚本，完全对齐 gen_goldcoin.lua 的实现：
- 内联 class 模块（正确遍历 C++ 类成员）
- 导入全局类型（Vector2, ARGB, Task 等）
- 显示进度条 UI
- 使用 coroutine.wrap + Task.Schedule 逐帧推进
"""


def generate_gen_script(mesh_name: str) -> str:
    """生成 gen_xxx.lua 编译驱动脚本

    Args:
        mesh_name: 模型名称（如 "goldcoin"）

    Returns:
        gen_xxx.lua 脚本内容
    """
    return f"""-- gen_{mesh_name}.lua
-- PDE Studio 自动生成
-- 内联 class 模块（兼容 Lua 5.2）

local class_cache = {{}}

class = {{}}

function class.import(name)
	local m = class_cache[name]
	if m then return m end

	local typeInfo = ptr_typeof(name)

	if typeInfo then
		m = {{}}
		for i = 0, typeInfo:GetMemberCount() - 1 do
			local member = typeInfo:GetMemberById(i)

			if member:GetMemberKind() == "kStaticMethod" then
				m[member:GetName()] = ptr_cast(member):ToDelegate()
			end
		end

		local ctor = typeInfo:GetConstructor()

		if ctor then
			m[".ctor"] = ctor
			local __ptr_mt_call = getmetatable(ctor).__call
			local __ptr_ctor_call = function(self, arg1, ...)
				if type(arg1) == "table" then
					local ret = __ptr_mt_call(ctor, ...)
					for key, value in pairs(arg1) do
						if type(key) == "string" then
							ret[key] = value
						end
					end
					return ret
				else
					return __ptr_mt_call(ctor, arg1, ...)
				end
			end
			setmetatable(m, {{ __call = __ptr_ctor_call }})
		end
	end

	class_cache[name] = m
	return m
end

-- import common types into global
local import_type = class.import

Vector2 = import_type("Core.Vector2")
Vector3 = import_type("Core.Vector3")
Vector4 = import_type("Core.Vector4")
Quaternion = import_type("Core.Quaternion")
Color3 = import_type("Core.Color3")
Color4 = import_type("Core.Color4")
Matrix44 = import_type("Core.Matrix44")
ARGB = import_type("Core.ARGB")
XRGB = import_type("Core.XRGB")
Module = import_type("Core.Module")
Task = import_type("Core.Task")
Thread = import_type("Core.Thread")
Path = import_type("Core.Path")
Rectangle = import_type("Core.Rectangle")

local Resource = class.import("Client.Resource")

-- show console
console.Parent = gui

-- loading ui
local loading_frame = ptr_new "Gui.FlowLayout"
loading_frame.Dock = "kDockFill"
loading_frame.Align = "kAlignCenterBottom"
loading_frame.Parent = gui
loading_frame.BackgroundColor = ARGB(0, 0, 0, 0)

local progress_bar = ptr_new "Gui.Label"
progress_bar.BackgroundColor = ARGB(0, 0, 0, 0)
progress_bar.Parent = loading_frame
progress_bar.Size = Vector2(512, 20)
progress_bar.Margin = Vector4(0, 0, 0, 40)

local cache = {{}}

local function readfile(name)
	local file = io.open(name, "r")
	local result = ""
	local err = nil

	if file then
		result = file:read("*a")
		file:close()
	else
		err = "error open file"
	end

	return result
end

local func, err = loadin(cache, readfile("cache_{mesh_name}.lua"))

if err then
	print(err)
	return
end

func()

local resource_count = 1
local resource_loaded = 1

-- get resource count
for _, t in pairs(cache) do
	if type(t) == "table" then
		resource_count = resource_count + #t
	end
end

print(string.format("total resources to build: %d", resource_count))

local work_thread = coroutine.wrap(function()
	-- load resource
	for _, res in ipairs(cache.resource) do
		Resource.GC()
		print("building: " .. res)
		Resource.Build(res, false)
		coroutine.yield()
	end

	-- load physx
	for _, res in ipairs(cache.physx) do
		Resource.GC()
		Resource.BuildByType(res, "physx", false)
		coroutine.yield()
	end

	-- copy scripts
	for _, file in ipairs(cache.copy) do
		if Resource.CopyFile(file) then
			print("copy file "..file)
		end
		coroutine.yield()
	end

	return true
end)

-- a per frame task
Task.Schedule(function()
	if work_thread() then
		print("all resources built successfully!")
		game:Exit()
	else
		resource_loaded = resource_loaded + 1
		progress_bar.Text = string.format("building: %d / %d", resource_loaded, resource_count)
		Task.Schedule()
	end
end)
"""
