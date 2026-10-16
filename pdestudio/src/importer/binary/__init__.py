#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 二进制解析子包

集中管理 PDE 引擎二进制格式解析:
- crc32:           PDE 自定义 CRC32 算法
- cache_decoder:   .cache 文件解码 (Resource 头 + LZ 解压 + CRC 校验)
- mesh:            Mesh 二进制解析 (MeshResource::LoadData)
- skeleton:        Skeleton 二进制解析 (Skeleton::LoadData)
- animation:       Animation 二进制解析 (AnimationTrack::Load)
"""
