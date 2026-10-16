namespace UnPde {
    public static class Extract {
        // 位移表 - 用于解压算法中的位移操作
        private static readonly byte[] ByteLimit = { 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0 };

        /// <summary>
        /// 二次解压预处理 - 处理压缩文件并决定是否需要进一步解压
        /// </summary>
        public static byte[] PreExtract(byte[] compressedData, string fileName) {
            // 检查数据大小是否足够
            if (compressedData.Length <= 0x18) {
                throw new Exception("数据大小不足，无法读取标识位");
            }

            // 解码后大小标识
            byte sizeFlag = compressedData[0x18];

            // 如果不等于 0 则需要二次解压
            if ((sizeFlag & 1) != 0) {
                // 待解压的数据
                byte[] encryptedData;
                // 解压后的数据大小
                uint extractedSize;

                // 根据标识设置偏移值
                switch (sizeFlag) {
                    case 0x6F: // 常规文件 (0x6F 标识)
                        // 检查数据大小是否足够
                        if (compressedData.Length <= 0x21) {
                            throw new Exception("数据大小不足，无法读取 0x6F 类型文件");
                        }

                        // 获取解压后数据长度
                        extractedSize = BitConverter.ToUInt32(compressedData, 0x1D);

                        // 初始化待解压的数据大小并复制
                        encryptedData = new byte[compressedData.Length - 0x21];
                        Array.Copy(compressedData, 0x21, encryptedData, 0, encryptedData.Length);
                        break;

                    case 0x6D: // 非常规文件 (0x6D 标识)
                        // 检查数据大小是否足够
                        if (compressedData.Length <= 0x1B) {
                            throw new Exception("数据大小不足，无法读取 0x6D 类型文件");
                        }

                        // 获取解压后数据长度
                        extractedSize = compressedData[0x1A];

                        // 初始化待解压的数据大小并复制
                        encryptedData = new byte[compressedData.Length - 0x1B];
                        Array.Copy(compressedData, 0x1B, encryptedData, 0, encryptedData.Length);
                        break;

                    default:
                        // 未知文件类型
                        throw new Exception("未知的解压标识: " + sizeFlag);
                }

                // 执行解压
                byte[] extractedData = FinalExtract(encryptedData, extractedSize, fileName);

                if (!GlobalVars.SaveFirst8Byte) {
                    // 删除前 8 个字节，因为8个字节之后才是原始数据
                    if (extractedData.Length > 8) {
                        extractedData = extractedData.Skip(8).ToArray();
                    }
                }

                return extractedData;
            } else {
                // 不需要二次解压
                if (compressedData.Length <= 0x29) {
                    Console.WriteLine($"[警告] {fileName} 初次解压后的字节数组长度不足，无法删除前0x29个字节");
                    return compressedData;
                } else {
                    // 是否需要保留解压后的前8字节
                    if (GlobalVars.SaveFirst8Byte) {
                        // 删除前0x21个字节
                        return compressedData.Skip(0x21).ToArray();
                    } else {
                        // 删除前0x29个字节
                        return compressedData.Skip(0x29).ToArray();
                    }
                }
            }
        }

        /// <summary>
        /// 执行LZ77算法的解压过程
        /// </summary>
        private static byte[] FinalExtract(byte[] compressedData, uint extractedSize, string fileName) {
            try {
                // 初始化解压后的数据缓冲区
                byte[] extractedData = new byte[extractedSize];

                // 初始化解压状态
                DecompressionState state = new DecompressionState((int)extractedSize);

                // 主解压循环
                while (!state.IsComplete()) {
                    // 更新控制字
                    if (!UpdateControlWord(ref state, compressedData)) break;

                    // 读取当前数据块
                    if (state.SourceIndex + 4 > compressedData.Length) break;
                    uint currentData = BitConverter.ToUInt32(compressedData, state.SourceIndex);

                    // 根据控制位决定解压模式
                    if ((state.ControlWord & 1) == 0) {
                        // 直接复制模式
                        if (!ProcessCopyMode(ref state, currentData, extractedData)) break;
                    } else {
                        // 回溯引用模式
                        if (!ProcessBackReferenceMode(ref state, currentData, extractedData)) break;
                    }
                }

                // 处理剩余数据
                ProcessRemainingData(ref state, compressedData, extractedData);

                return extractedData;
            } catch (Exception e) {
                throw new Exception($"[错误] 解压 {fileName} 失败: {e.Message}");
            }
        }

        /// <summary>
        /// 解析回溯引用信息，从压缩数据中提取偏移和长度信息
        /// </summary>
        private static BackReferenceInfo ParseBackReference(uint data) {
            BackReferenceInfo info = new BackReferenceInfo { Offset = 0, Length = 0, BytesConsumed = 0 };

            // 根据标志位解析回溯偏移和复制长度
            if ((data & 3) != 0) {
                if ((data & 2) != 0) {
                    if ((data & 1) != 0) {
                        if ((data & 0x7F) == 3) {
                            // 格式1: 最复杂的情况
                            info.Offset = data >> 15;
                            info.Length = ((data >> 7) & 0xFF) + 3;
                            info.BytesConsumed = 4;
                        } else {
                            // 格式2: 次复杂的情况
                            info.Offset = (data >> 7) & 0x1FFFF;
                            info.Length = ((data >> 2) & 0x1F) + 2;
                            info.BytesConsumed = 3;
                        }
                    } else {
                        // 格式3: 中等复杂度
                        info.Offset = (data >> 6) & 0x3FF;
                        info.Length = ((data >> 2) & 0xF) + 3;
                        info.BytesConsumed = 2;
                    }
                } else {
                    // 格式4: 简单情况
                    info.Offset = (data >> 2) & 0x3FFF;
                    info.Length = 3;
                    info.BytesConsumed = 2;
                }
            } else {
                // 格式5: 最简单的情况
                info.Offset = (data >> 2) & 0x3F;
                info.Length = 3;
                info.BytesConsumed = 1;
            }

            return info;
        }

        /// <summary>
        /// 更新解压状态中的控制字
        /// </summary>
        private static bool UpdateControlWord(ref DecompressionState state, byte[] data) {
            if (state.ControlWord == 1) {
                if (state.SourceIndex + 4 > data.Length) return false;
                state.ControlWord = BitConverter.ToUInt32(data, state.SourceIndex);
                state.SourceIndex += 4;
            }
            return true;
        }

        /// <summary>
        /// 处理直接复制模式的解压
        /// </summary>
        private static bool ProcessCopyMode(ref DecompressionState state, uint data, byte[] extractedData) {
            // 安全检查
            if (!state.HasEnoughSpace()) return false;

            // 复制4字节数据
            byte[] dataBytes = BitConverter.GetBytes(data);
            Array.Copy(dataBytes, 0, extractedData, state.DestIndex, 4);

            // 计算要复制的字节数
            uint bytesToCopy = ByteLimit[state.ControlWord & 0xF];
            state.DestIndex += (int)bytesToCopy;
            state.SourceIndex += (int)bytesToCopy;
            state.ControlWord >>= (int)bytesToCopy;

            return true;
        }

        /// <summary>
        /// 处理回溯引用模式的解压（LZ77算法核心）
        /// </summary>
        private static bool ProcessBackReferenceMode(ref DecompressionState state, uint data, byte[] extractedData) {
            // 消耗一个控制位
            state.ControlWord >>= 1;
            uint savedControlWord = state.ControlWord;

            // 解析回溯偏移和长度
            BackReferenceInfo info = ParseBackReference(data);
            state.SourceIndex += (int)info.BytesConsumed;

            // 计算源引用索引
            int referenceIndex = state.DestIndex - (int)info.Offset;
            if (referenceIndex >= extractedData.Length) return false;

            // 复制数据（LZ77算法的核心：从已解压的数据中复制）
            for (int i = 0; i < info.Length; i++) {
                if (state.DestIndex + i >= extractedData.Length ||
                    referenceIndex + i >= extractedData.Length) break;
                extractedData[state.DestIndex + i] = extractedData[referenceIndex + i];
            }

            state.DestIndex += (int)info.Length;
            state.ControlWord = savedControlWord;

            return true;
        }

        /// <summary>
        /// 处理剩余数据的解压
        /// </summary>
        private static void ProcessRemainingData(ref DecompressionState state, byte[] compressedData, byte[] extractedData) {
            while (state.DestIndex < state.TargetSize) {
                if (state.ControlWord == 1) {
                    if (state.SourceIndex + 4 > compressedData.Length) break;
                    state.ControlWord = 0x80000000;  // 设置最高位为1
                    state.SourceIndex += 4;
                }
                if (state.SourceIndex >= compressedData.Length) break;
                extractedData[state.DestIndex] = compressedData[state.SourceIndex];
                state.DestIndex++;
                state.SourceIndex++;
                state.ControlWord >>= 1;
            }
        }
    }
}