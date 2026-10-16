package main

import (
	"encoding/binary"
	"fmt"
)

// 位移表 - 用于解压算法中的位移操作
var byteLimit = [16]byte{4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0}

// 解析回溯引用信息，从压缩数据中提取偏移和长度信息
func parseBackReference(data uint32) BackReferenceInfo {
	info := BackReferenceInfo{}

	// 根据标志位解析回溯偏移和复制长度
	if (data & 3) != 0 {
		if (data & 2) != 0 {
			if (data & 1) != 0 {
				if (data & 0x7F) == 3 {
					// 格式1: 最复杂的情况
					info.Offset = data >> 15
					info.Length = ((data >> 7) & 0xFF) + 3
					info.BytesConsumed = 4
				} else {
					// 格式2: 次复杂的情况
					info.Offset = (data >> 7) & 0x1FFFF
					info.Length = ((data >> 2) & 0x1F) + 2
					info.BytesConsumed = 3
				}
			} else {
				// 格式3: 中等复杂度
				info.Offset = (data >> 6) & 0x3FF
				info.Length = ((data >> 2) & 0xF) + 3
				info.BytesConsumed = 2
			}
		} else {
			// 格式4: 简单情况
			info.Offset = (data >> 2) & 0x3FFF
			info.Length = 3
			info.BytesConsumed = 2
		}
	} else {
		// 格式5: 最简单的情况
		info.Offset = (data >> 2) & 0x3F
		info.Length = 3
		info.BytesConsumed = 1
	}

	return info
}

// 更新解压状态中的控制字
func updateControlWord(state *DecompressionState, data []byte) bool {
	if state.ControlWord == 1 {
		if uint64(state.SourceIndex)+4 > uint64(len(data)) {
			return false
		}
		state.ControlWord = binary.LittleEndian.Uint32(data[state.SourceIndex:])
		state.SourceIndex += 4
	}
	return true
}

// 处理直接复制模式的解压
func processCopyMode(state *DecompressionState, data uint32, extractedData []byte) bool {
	// 安全检查
	if !state.HasEnoughSpace(0) {
		return false
	}

	// 复制4字节数据
	binary.LittleEndian.PutUint32(extractedData[state.DestIndex:], data)

	// 计算要复制的字节数
	bytesToCopy := byteLimit[state.ControlWord&0xF]
	state.DestIndex += uint32(bytesToCopy)
	state.SourceIndex += uint32(bytesToCopy)
	state.ControlWord >>= bytesToCopy

	return true
}

// 处理回溯引用模式的解压（LZ77算法核心）
func processBackReferenceMode(state *DecompressionState, data uint32, extractedData []byte) bool {
	// 消耗一个控制位
	state.ControlWord >>= 1
	savedControlWord := state.ControlWord

	// 解析回溯偏移和长度
	info := parseBackReference(data)
	state.SourceIndex += info.BytesConsumed

	// 计算源引用索引
	referenceIndex := state.DestIndex - info.Offset
	if referenceIndex >= uint32(len(extractedData)) {
		return false
	}

	// 复制数据（LZ77算法的核心：从已解压的数据中复制）
	for i := uint32(0); i < info.Length; i++ {
		if state.DestIndex+i >= uint32(len(extractedData)) || referenceIndex+i >= uint32(len(extractedData)) {
			break
		}
		extractedData[state.DestIndex+i] = extractedData[referenceIndex+i]
	}

	state.DestIndex += info.Length
	state.ControlWord = savedControlWord

	return true
}

// 处理剩余数据的解压
func processRemainingData(state *DecompressionState, compressedData, extractedData []byte) {
	for state.DestIndex < state.TargetSize {
		if state.ControlWord == 1 {
			if state.SourceIndex+4 > uint32(len(compressedData)) {
				break
			}
			state.ControlWord = 0x80000000 // 设置最高位为1
			state.SourceIndex += 4
		}
		if state.SourceIndex >= uint32(len(compressedData)) {
			break
		}
		extractedData[state.DestIndex] = compressedData[state.SourceIndex]
		state.DestIndex++
		state.SourceIndex++
		state.ControlWord >>= 1
	}
}

// 执行LZ77算法的解压过程
func FinalExtract(compressedData []byte, extractedSize uint64, fileName string) ([]byte, error) {
	// 初始化解压后的数据缓冲区
	extractedData := make([]byte, extractedSize)

	// 初始化解压状态
	state := NewDecompressionState(uint32(extractedSize))

	// 主解压循环
	for !state.IsComplete() {
		// 更新控制字
		if !updateControlWord(state, compressedData) {
			break
		}

		// 读取当前数据块
		if state.SourceIndex+4 > uint32(len(compressedData)) {
			break
		}
		currentData := binary.LittleEndian.Uint32(compressedData[state.SourceIndex:])

		// 根据控制位决定解压模式
		if (state.ControlWord & 1) == 0 {
			// 直接复制模式
			if !processCopyMode(state, currentData, extractedData) {
				break
			}
		} else {
			// 回溯引用模式
			if !processBackReferenceMode(state, currentData, extractedData) {
				break
			}
		}
	}

	// 处理剩余数据
	processRemainingData(state, compressedData, extractedData)

	return extractedData, nil
}

// 二次解压预处理 - 根据文件标识决定解压方式并执行解压
func PreExtract(compressedData []byte, fileName string) ([]byte, error) {
	// 检查数据大小是否足够
	if len(compressedData) <= 0x18 {
		return nil, fmt.Errorf("数据大小不足，无法读取标识位")
	}

	// 解码后大小标识
	sizeFlag := compressedData[0x18]

	// 如果不等于 0 则需要二次解压
	if (sizeFlag & 1) != 0 {
		var encryptedData []byte
		var extractedSize uint64

		// 根据标识设置偏移值
		switch sizeFlag {
		case 0x6F: // 常规文件 (0x6F 标识)
			// 检查数据大小是否足够
			if len(compressedData) <= 0x21 {
				return nil, fmt.Errorf("数据大小不足，无法读取 0x6F 类型文件")
			}

			// 获取解压后数据长度
			extractedSize = uint64(binary.LittleEndian.Uint32(compressedData[0x1D:]))

			// 初始化待解压的数据大小并复制
			encryptedData = make([]byte, len(compressedData)-0x21)
			copy(encryptedData, compressedData[0x21:])
		case 0x6D: // 非常规文件 (0x6D 标识)
			// 检查数据大小是否足够
			if len(compressedData) <= 0x1B {
				return nil, fmt.Errorf("数据大小不足，无法读取 0x6D 类型文件")
			}

			// 获取解压后数据长度
			extractedSize = uint64(compressedData[0x1A])

			// 初始化待解压的数据大小并复制
			encryptedData = make([]byte, len(compressedData)-0x1B)
			copy(encryptedData, compressedData[0x1B:])
		default:
			// 未知文件类型
			return nil, fmt.Errorf("未知的解压标识: %d", sizeFlag)
		}

		// 执行解压
		extractedData, err := FinalExtract(encryptedData, extractedSize, fileName)
		if err != nil {
			return nil, err
		}

		if !SaveFirst8Byte {
			// 删除前 8 个字节，因为8个字节之后才是原始数据
			if len(extractedData) > 8 {
				extractedData = extractedData[8:]
			}
		}

		return extractedData, nil
	} else {
		// 不需要二次解压
		if len(compressedData) <= 0x29 {
			fmt.Printf("[警告] %s 初次解压后的字节数组长度不足，无法删除前0x29个字节\n", fileName)
			return compressedData, nil
		} else {
			// 是否需要保留解压后的前8字节
			if SaveFirst8Byte {
				// 删除前0x21个字节
				return compressedData[0x21:], nil
			} else {
				// 删除前0x29个字节
				return compressedData[0x29:], nil
			}
		}
	}
}
