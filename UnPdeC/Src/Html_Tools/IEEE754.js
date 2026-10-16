window.onload = function () {
    // 读取本地缓存
    // var hexInput = localStorage.getItem('hexInput');
    // if (hexInput?.length) {
    //     document.getElementById('hexInput').value = hexInput;
    // }

    // 转换数据
    convertMultiple();
}

// 当前显示的通知元素
var currentNotification = null;

// 显示通知
function showNotification(message, type) {
    // 如果已有通知显示，则先移除
    if (currentNotification && currentNotification.parentNode) {
        currentNotification.parentNode.removeChild(currentNotification);
    }

    var notification = document.createElement('div');
    notification.className = 'notification ' + type;
    notification.innerHTML = message;

    // 设置悬浮通知样式
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.left = '50%';
    notification.style.transform = 'translateX(-50%)';
    notification.style.zIndex = '1000';
    notification.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
    notification.style.minWidth = '300px';

    // 保存当前通知引用
    currentNotification = notification;

    document.body.appendChild(notification);

    // 3秒后自动消失
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
            if (currentNotification === notification) {
                currentNotification = null;
            }
        }
    }, 300000);
}

// 复制文本到剪贴板
function copyToClipboard(text) {
    // 创建临时 textarea 元素
    var textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);

    // 显示通知
    showNotification('ฅᐞ˶⦁༝⦁˶ᐞฅ: ' + text, 'is-success');
}

// 判断是否为有效的十六进制值
function isValidHex(hex) {
    return /^[0-9a-fA-F]+$/.test(hex);
}

// 保存缓存
// function saveCache(hexInput) {
//     // 保存 hexInput 到 localStorage
//     localStorage.setItem('hexInput', hexInput);
// }

// 将十六进制转换为单精度浮点数
function hexToFloat32(hex, endian) {
    hex = hex.replace(/^0x/, '');
    while (hex.length < 8) hex = '0' + hex;

    if (endian === 'little') {
        hex = hex.match(/.{2}/g)?.reverse()?.join('');
    }

    var int = parseInt(hex, 16);
    var float32 = new Float32Array(1);
    var int32 = new Int32Array(float32.buffer);
    int32[0] = int;
    var floatNum = float32[0].toString().split('.');
    return floatNum[0] + '.' + (floatNum[1] ? floatNum[1].slice(0, 8) : '00000000');
}

// 将十六进制转换为半精度浮点数
function hexToFloat16(hex, endian) {
    hex = hex.replace(/^0x/, '');
    while (hex.length < 4) hex = '0' + hex;

    if (endian === 'little') {
        hex = hex.match(/.{2}/g)?.reverse()?.join('');
    }

    var value = parseInt(hex, 16);

    var sign = (value >> 15) & 0x1;
    var exponent = (value >> 10) & 0x1F;
    var mantissa = value & 0x3FF;

    if (exponent === 0) {
        return sign ?
            (-Math.pow(2, -14) * (mantissa / 1024)).toFixed(8) :
            (Math.pow(2, -14) * (mantissa / 1024)).toFixed(8);
    }

    if (exponent === 31) {
        return mantissa === 0 ?
            (sign ? "-Infinity" : "Infinity") :
            "NaN";
    }

    var float = Math.pow(-1, sign) *
        Math.pow(2, exponent - 15) *
        (1 + mantissa / 1024);

    return float.toFixed(8);
}

// 将十六进制转换为浮点数
function convertMultiple(localHex) {
    var hexInput = "";
    if (localHex?.length) {
        hexInput = localHex;
        document.getElementById('hexInput').value = hexInput;
    } else {
        hexInput = document.getElementById('hexInput').value;
    }

    // 如果输入为空，清空结果
    if (!hexInput.trim()) {
        document.getElementById('multipleResult').innerHTML = '';
        document.getElementById('groupInfo').innerHTML = 'ฅᐞ˶⦁༝⦁˶ᐞฅ';
        document.getElementById('error').style.display = 'none';
        return;
    }

    // 保存缓存
    // saveCache(hexInput);
    var endian = document.getElementById('endian').value;
    var groupSizeBytes = parseInt(document.getElementById('groupSize').value); // 获取每行的字节数
    var groupSize = groupSizeBytes / 4; // 每行显示的数据个数（每个数据占 4 字节）
    hexInput = hexInput.replace(/\s+/g, '');
    var hexValues = [];
    var error = false;

    for (var i = 0; i < hexInput.length; i += 8) {
        var hex = hexInput.substr(i, 8);
        if (!isValidHex(hex)) {
            document.getElementById('error').textContent = '输入错误：存在非法的十六进制值。';
            document.getElementById('error').style.display = 'block';
            error = true;
            break;
        }
        hexValues.push(hex);
    }

    if (error) {
        document.getElementById('multipleResult').innerHTML = '';
        return;
    }

    document.getElementById('error').style.display = 'none';
    var results = [];
    var groupCount = 0; // 从0开始计数，这样第一组就是索引0

    // 从本地存储加载模板 - 只需要一个全局模板
    var templateKey = 'floatTemplate_' + groupSizeBytes;
    var template = localStorage.getItem(templateKey);
    var halfFloatSettings = template ? JSON.parse(template) : Array(groupSize).fill(false);

    for (var i = 0; i < hexValues.length; i += groupSize) {
        var group = hexValues.slice(i, i + groupSize);
        var groupResult = '';

        // 所有组都使用相同的模板设置
        groupResult = group.map((hex, index) => {
            // 确保索引在模板范围内
            var isHalfFloat = index < halfFloatSettings.length ? halfFloatSettings[index] : false;

            if (isHalfFloat) {
                // 半精度浮点数 (16位)
                var halfHex1 = hex.substr(0, 4);
                var halfHex2 = hex.substr(4, 4);
                var result1 = hexToFloat16(halfHex1, endian);
                var result2 = hexToFloat16(halfHex2, endian);

                // 只在第一组显示复选框
                if (groupCount === 0) {
                    return `
                        <div class="half-float mb-2">
                            <label class="checkbox mr-2" style="display: inline-flex; align-items: center;">
                                <input type="checkbox" id="half_float_${index}" checked 
                                    onclick="toggleHalfFloat(${index})">
                                <span class="tag is-dark is-light ml-1">半精度</span>
                            </label>
                            <span class="has-text-weight-bold">${hex}</span> 
                            <span class="has-text-grey-light">→</span> 
                            <span class="copyable" onclick="copyToClipboard('${result1}')">${result1}</span> 
                            <span class="">,</span> 
                            <span class="copyable" onclick="copyToClipboard('${result2}')">${result2}</span>
                        </div>
                    `;
                } else {
                    return `
                        <div class="half-float mb-2">
                            <span class="tag is-dark is-light">半精度</span>
                            <span class="has-text-weight-bold">${hex}</span> 
                            <span class="has-text-grey-light">→</span> 
                            <span class="copyable" onclick="copyToClipboard('${result1}')">${result1}</span> 
                            <span class="">,</span> 
                            <span class="copyable" onclick="copyToClipboard('${result2}')">${result2}</span>
                        </div>
                    `;
                }
            } else {
                // 单精度浮点数 (32位)
                var result = hexToFloat32(hex, endian);

                // 只在第一组显示复选框
                if (groupCount === 0) {
                    return `
                        <div class="full-float mb-2">
                            <label class="checkbox mr-2" style="display: inline-flex; align-items: center;">
                                <input type="checkbox" id="half_float_${index}" 
                                    onclick="toggleHalfFloat(${index})">
                                <span class="tag is-light ml-1">单精度</span>
                            </label>
                            <span class="has-text-weight-bold">${hex}</span> 
                            <span class="has-text-grey-light">→</span> 
                            <span class="has-text-success copyable" onclick="copyToClipboard('${result}')">${result}</span>
                        </div>
                    `;
                } else {
                    return `
                        <div class="full-float mb-2">
                            <span class="tag is-light">单精度</span>
                            <span class="has-text-weight-bold">${hex}</span> 
                            <span class="has-text-grey-light">→</span> 
                            <span class="has-text-success copyable" onclick="copyToClipboard('${result}')">${result}</span>
                        </div>
                    `;
                }
            }
        }).join('');

        // 只在第一组添加保存模板按钮
        if (groupCount === 0) {
            groupResult += `
                <div class="field is-grouped mt-4">
                    <div class="control">
                        <button class="button is-success is-small" onclick="saveHalfFloatSettings()">
                            <span class="icon">
                                <i class="fas fa-save"></i>
                            </span>
                            <span>保存模板</span>
                        </button>
                    </div>
                </div>
            `;
        }

        groupCount++; // 增加组计数

        results.push(`
            <div class="float-value box">
                <div class="line-number">第 ${groupCount} 组</div>
                ${groupResult}
            </div>
        `);
    }

    // 输出到页面
    document.getElementById('multipleResult').innerHTML = results.join('');
    document.getElementById('groupInfo').innerHTML = `共 ${hexValues.length} 行数据，${groupCount} 组`;
}

// 切换半精度浮点数选项
function toggleHalfFloat(dataIndex) {
    console.log(`Toggling half float at index ${dataIndex}`);

    // 获取当前组大小
    var groupSizeBytes = parseInt(document.getElementById('groupSize').value);
    var templateKey = 'floatTemplate_' + groupSizeBytes;

    // 从本地存储加载当前模板
    var template = localStorage.getItem(templateKey);
    var halfFloatSettings = template ? JSON.parse(template) : Array(groupSizeBytes / 4).fill(false);

    // 切换当前索引的状态
    halfFloatSettings[dataIndex] = !halfFloatSettings[dataIndex];

    // 保存回本地存储
    localStorage.setItem(templateKey, JSON.stringify(halfFloatSettings));

    // 重新计算并显示结果
    convertMultiple();
}

// 保存半精度浮点数设置
function saveHalfFloatSettings() {
    var groupSizeBytes = parseInt(document.getElementById('groupSize').value);
    var count = groupSizeBytes / 4;
    var halfFloatSettings = [];

    for (var i = 0; i < count; i++) {
        var checkbox = document.getElementById('half_float_' + i);
        halfFloatSettings.push(checkbox ? checkbox.checked : false);
    }

    var templateKey = 'floatTemplate_' + groupSizeBytes;
    localStorage.setItem(templateKey, JSON.stringify(halfFloatSettings));
    showNotification('模板已保存！', 'is-success');
}

// 清除缓存函数也需要更新
function clearCache() {
    localStorage.removeItem('hexInput');
    // 清除所有模板
    var groupSizes = [24, 28, 52, 64];
    for (var i = 0; i < groupSizes.length; i++) {
        // 只清除全局模板
        localStorage.removeItem('floatTemplate_' + groupSizes[i]);
    }
    document.getElementById('hexInput').value = '';
    document.getElementById('multipleResult').innerHTML = '';
    document.getElementById('groupInfo').innerHTML = 'ฅᐞ˶⦁༝⦁˶ᐞฅ';

    showNotification('所有缓存已清除！', 'is-warning');
}

// 复制结果
function copyResults() {
    var resultDiv = document.getElementById('multipleResult');
    if (!resultDiv.textContent.trim()) {
        showNotification('没有可复制的结果！', 'is-warning');
        return;
    }

    var textToCopy = resultDiv.innerText;
    var textArea = document.createElement("textarea");
    textArea.value = textToCopy;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);

    showNotification('结果已复制到剪贴板！', 'is-success');
}

// Back To Top Button
let backToTopBtn = document.getElementById("backToTopBtn");

// 监听页面滚动事件
window.onscroll = function () {
    scrollFunction();
};

// 根据滚动位置显示或隐藏按钮
function scrollFunction() {
    if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
        backToTopBtn.style.display = "block";
    } else {
        backToTopBtn.style.display = "none";
    }
}

// 点击按钮时，平滑滚动回到顶部
backToTopBtn.addEventListener("click", function () {
    window.scrollTo({
        top: 0,
        behavior: "smooth" // 平滑滚动效果
    });
});