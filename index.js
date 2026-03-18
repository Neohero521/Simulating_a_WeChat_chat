// 导入SillyTavern核心模块
import {
    extension_settings,
    getContext,
    loadExtensionSettings,
} from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

// 插件基础配置
const extensionName = "Simulating_a_WeChat_chat";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[extensionName];
const defaultSettings = {
    autoOpen: false,
    streamingEnabled: true,
    streamingSpeed: 1
};

// 全局状态管理（完全保留原功能状态）
const state = {
    character: null,
    userInfo: {
        name: '你',
        avatar: null,
        description: ''
    },
    baseChatHistoryKey: 'st_wechat_chat_history_',
    baseChatBgKey: 'st_wechat_chat_bg_',
    isGenerating: false,
    msgMenuTarget: null,
    replyingTo: null,
    messageListeners: new Map(),
    lastMessageTime: null,
    currentMode: 'online',
    modeConfig: {
        online: {
            name: '线上模式',
            color: '#07c160',
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>`,
            description: '微信风格纯对话'
        },
        offline: {
            name: '线下模式',
            color: '#4a8cff',
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4M12 8h.01"/>
            </svg>`,
            description: '包含动作、神态、场景'
        },
        story: {
            name: '故事模式',
            color: '#a855f7',
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>`,
            description: '强化叙事性和情节连贯'
        }
    },
    storyUserInputCache: null,
    streamingMessages: new Map(),
    sendBtnState: 'normal',
    aiResponseCache: null,
    isStreaming: false,
    isFullScreen: false,
    streamingEnabled: true,
    streamingSpeed: 1,
    activeMessageId: null,
    dom: {} // DOM元素缓存
};

// 加载插件设置
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    // 同步设置到状态
    state.streamingEnabled = extension_settings[extensionName].streamingEnabled ?? defaultSettings.streamingEnabled;
    state.streamingSpeed = extension_settings[extensionName].streamingSpeed ?? defaultSettings.streamingSpeed;

    // 更新UI设置
    $("#wechat_auto_open").prop("checked", extension_settings[extensionName].autoOpen).trigger("input");
    
    // 自动打开窗口
    if (extension_settings[extensionName].autoOpen) {
        setTimeout(() => openWechatWindow(), 500);
    }
}

// 自动打开设置事件
function onAutoOpenChange(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].autoOpen = value;
    saveSettingsDebounced();
}

// 打开微信聊天窗口
function openWechatWindow() {
    if ($("#wechat_main_window").length > 0) {
        $("#wechat_main_window").show();
        initWechatChat();
        showToast("微信聊天窗口已打开");
        return;
    }

    // 注入聊天界面到页面
    const windowTemplate = $("#wechat_window_template").html();
    $("body").append(windowTemplate);
    
    // 初始化聊天功能
    initWechatChat();
    showToast("微信聊天窗口已打开");
}

// 关闭微信聊天窗口
function closeWechatWindow() {
    $("#wechat_main_window").remove();
    $(".msg-actions").remove();
    $(".confirm-modal").remove();
    $(".hidden-input").remove();
    $(".toast").remove();
    // 清理事件监听
    state.messageListeners.forEach((listeners, element) => {
        removeMsgInteractions(element);
    });
    state.messageListeners.clear();
    showToast("微信聊天窗口已关闭");
}

// 初始化微信聊天核心功能（完全保留原功能）
function initWechatChat() {
    // 缓存DOM元素
    state.dom = {
        inputBox: document.getElementById('input-box'),
        footerBar: document.getElementById('footer-bar'),
        sendBtn: document.getElementById('send-btn'),
        sendBtnText: document.querySelector('.send-text'),
        chatList: document.getElementById('chat-list'),
        charNameDisplay: document.getElementById('char-name-display'),
        statusIndicator: document.getElementById('status-indicator'),
        statusDot: document.getElementById('status-dot'),
        statusText: document.getElementById('status-text'),
        confirmModal: document.getElementById('confirm-modal'),
        cancelDeleteBtn: document.getElementById('cancel-delete'),
        confirmDeleteBtn: document.getElementById('confirm-delete'),
        emptyTip: document.getElementById('empty-tip'),
        emptyImportBtn: document.getElementById('empty-import-btn'),
        characterImportInput: document.getElementById('character-import-input'),
        toast: document.getElementById('toast'),
        moreBtn: document.getElementById('more-btn'),
        dropdownMenu: document.getElementById('dropdown-menu'),
        importCharItem: document.getElementById('import-char-item'),
        chatBgItem: document.getElementById('chat-bg-item'),
        exportChatItem: document.getElementById('export-chat-item'),
        deleteAllItem: document.getElementById('delete-all-item'),
        fullscreenItem: document.getElementById('fullscreen-item'),
        streamingToggleItem: document.getElementById('streaming-toggle-item'),
        chatBgInput: document.getElementById('chat-bg-input'),
        msgActions: document.getElementById('msg-actions'),
        msgActionReply: document.getElementById('msg-action-reply'),
        msgActionCopy: document.getElementById('msg-action-copy'),
        msgActionDelete: document.getElementById('msg-action-delete'),
        replyPreview: document.getElementById('reply-preview'),
        replyPreviewContent: document.getElementById('reply-preview-content'),
        replyPreviewCancel: document.getElementById('reply-preview-cancel'),
        modeSwitch: document.getElementById('mode-switch'),
        wechatCloseBtn: document.getElementById('wechat_close_btn')
    };

    // 初始化用户设定
    const userPersona = getUserPersonaFromST();
    if (userPersona) {
        state.userInfo = {
            name: userPersona.name || state.userInfo.name,
            avatar: userPersona.avatar || state.userInfo.avatar,
            description: userPersona.description || state.userInfo.description
        };
    }

    // 初始化模式显示
    updateModeDisplay();

    // 初始化流式开关
    if (state.streamingEnabled) {
        state.dom.streamingToggleItem.textContent = '关闭伪流式';
    } else {
        state.dom.streamingToggleItem.textContent = '开启伪流式';
    }

    // 绑定所有事件
    bindEvents();

    // 更新输入框状态
    if (!state.character) {
        state.dom.inputBox.setAttribute('disabled', 'disabled');
        state.dom.sendBtn.disabled = true;
    }

    // 更新placeholder
    updateInputBoxPlaceholder();
}

// 绑定所有事件（完全保留原功能事件）
function bindEvents() {
    const dom = state.dom;

    // 窗口关闭按钮
    dom.wechatCloseBtn.onclick = closeWechatWindow;

    // 发送按钮
    dom.sendBtn.onclick = sendMessage;

    // 输入框回车发送
    dom.inputBox.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey && state.character) {
            e.preventDefault();
            sendMessage();
        }
    };

    // 输入框内容变化
    dom.inputBox.addEventListener('input', () => {
        const hasText = dom.inputBox.textContent.trim().length > 0;
        dom.footerBar.classList.toggle('has-text', hasText);
        dom.sendBtn.disabled = !hasText || !state.character;
        checkAndShowPlaceholder();
    });

    dom.inputBox.addEventListener('focus', () => checkAndShowPlaceholder());
    dom.inputBox.addEventListener('blur', () => checkAndShowPlaceholder());

    // 模式切换
    dom.modeSwitch.onclick = switchMode;

    // 角色卡导入
    dom.characterImportInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        dom.characterImportInput.value = '';
        try {
            let characterData;
            if (file.name.endsWith('.png')) {
                characterData = await extractCharacterFromPNG(file);
            } else if (file.name.endsWith('.json')) {
                characterData = await extractCharacterFromJSON(file);
                if (!characterData.avatar) {
                    characterData.avatar = `https://picsum.photos/seed/${encodeURIComponent(characterData.name)}/200/200`;
                }
            } else {
                throw new Error('仅支持PNG/JSON格式');
            }
            await importCharacterToUI(characterData);
        } catch (err) {
            showToast(`解析失败：${err.message}`, 'error');
        }
        closeDropdownMenu();
    });

    // 空页面导入按钮
    dom.emptyImportBtn.onclick = () => {
        dom.characterImportInput.style.zIndex = '9999';
        dom.characterImportInput.click();
    };

    // 更多菜单
    dom.moreBtn.onclick = (e) => {
        e.stopPropagation();
        toggleDropdownMenu();
    };

    document.addEventListener('click', (e) => {
        if (!dom.moreBtn.contains(e.target) && !dom.dropdownMenu.contains(e.target)) {
            closeDropdownMenu();
        }
    });

    // 菜单选项事件
    dom.importCharItem.onclick = () => {
        dom.characterImportInput.style.zIndex = '9999';
        dom.characterImportInput.click();
        closeDropdownMenu();
    };

    dom.chatBgItem.onclick = () => {
        selectChatBg();
        closeDropdownMenu();
    };

    dom.fullscreenItem.onclick = toggleFullScreen;
    dom.streamingToggleItem.onclick = toggleStreaming;
    dom.exportChatItem.onclick = () => {
        exportChatHistory();
        closeDropdownMenu();
    };
    dom.deleteAllItem.onclick = () => {
        const chatHistory = loadChatHistory();
        if (chatHistory.length > 0) {
            dom.confirmModal.style.display = 'flex';
        } else {
            showToast('没有聊天记录可删除', 'error');
        }
        closeDropdownMenu();
    };

    // 聊天背景选择
    dom.chatBgInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleChatBgSelect(file);
        }
        dom.chatBgInput.value = '';
    });

    // 确认模态框
    dom.cancelDeleteBtn.onclick = () => {
        dom.confirmModal.style.display = 'none';
    };
    dom.confirmDeleteBtn.onclick = deleteAllChats;
    dom.confirmModal.onclick = (e) => {
        if (e.target === dom.confirmModal) {
            dom.confirmModal.style.display = 'none';
        }
    };

    // 消息操作事件
    dom.msgActionReply.onclick = function() {
        const index = state.msgMenuTarget;
        if (index >= 0) {
            const chatHistory = loadChatHistory();
            if (index < chatHistory.length) {
                const msg = chatHistory[index];
                setReplyTo(msg, index);
                closeMsgMenu();
                dom.inputBox.focus();
            }
        }
    };

    dom.msgActionCopy.onclick = function() {
        const index = state.msgMenuTarget;
        if (index >= 0) {
            const chatHistory = loadChatHistory();
            if (index < chatHistory.length) {
                const msg = chatHistory[index];
                let textToCopy = msg.text;
                const msgElement = document.querySelector(`.msg[data-index="${index}"]`);
                if (msgElement && (msgElement.classList.contains('story-user') || msgElement.classList.contains('story-char'))) {
                    textToCopy = msg.text;
                }
                navigator.clipboard.writeText(textToCopy).then(() => {
                    showToast('消息已复制');
                }).catch(() => {
                    const textArea = document.createElement('textarea');
                    textArea.value = textToCopy;
                    document.body.appendChild(textArea);
                    textArea.select();
                    try {
                        document.execCommand('copy');
                        showToast('消息已复制');
                    } catch (err) {
                        showToast('复制失败，请手动复制', 'error');
                    }
                    document.body.removeChild(textArea);
                });
                closeMsgMenu();
            }
        }
    };

    dom.msgActionDelete.onclick = function() {
        const index = state.msgMenuTarget;
        if (index >= 0) {
            const chatHistory = loadChatHistory();
            if (index < chatHistory.length) {
                deleteChatRecord(index);
                // 重新渲染
                dom.chatList.innerHTML = '';
                state.messageListeners.forEach((listeners, element) => {
                    removeMsgInteractions(element);
                });
                state.messageListeners.clear();
                state.lastMessageTime = null;
                const updatedHistory = loadChatHistory();
                updatedHistory.forEach((record, i) => {
                    if (record.sender === 'user' && record.mode === 'story') {
                        appendUserMessageStorySeparate(record.text, i, record.replyTo);
                    } else if (record.sender === 'char' && record.mode === 'story') {
                        appendStoryCharMessage(record.text, i, record.replyTo);
                    } else {
                        appendMsg(record.text, record.sender === 'user', i, record.replyTo, record.mode || 'online');
                    }
                });
                if (updatedHistory.length === 0 && state.character) {
                    const emptyTip = document.createElement('div');
                    emptyTip.className = 'empty-tip';
                    emptyTip.innerHTML = `开始和${state.character.name}聊天吧～`;
                    dom.chatList.appendChild(emptyTip);
                }
                showToast('消息已删除');
            }
            closeMsgMenu();
        }
    };

    // 引用回复取消
    dom.replyPreviewCancel.onclick = clearReply;

    // 全屏变化监听
    document.addEventListener('fullscreenchange', handleFullScreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullScreenChange);
    document.addEventListener('mozfullscreenchange', handleFullScreenChange);
    document.addEventListener('MSFullscreenChange', handleFullScreenChange);

    // 点击其他地方隐藏消息操作按钮
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.msg') && !e.target.closest('.action-btn')) {
            hideAllMsgActionButtons();
        }
    });
}

// ------------------------------
// 以下为原功能完整函数（无任何修改）
// ------------------------------

// 生成角色唯一ID
function generateCharacterId(characterData) {
    if (!characterData) return 'default';
    const name = characterData.name || '未知角色';
    const fileType = characterData.fileType || 'unknown';
    const cleanName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
    let hash = 0;
    for (let i = 0; i < cleanName.length; i++) {
        const char = cleanName.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16) + '_' + fileType;
}

// 获取当前角色的聊天记录存储键
function getCurrentChatHistoryKey() {
    if (!state.character) return state.baseChatHistoryKey + 'default';
    if (state.character.id) {
        return state.baseChatHistoryKey + state.character.id;
    } else {
        state.character.id = generateCharacterId(state.character);
        return state.baseChatHistoryKey + state.character.id;
    }
}

// 获取当前角色的聊天背景存储键
function getCurrentChatBgKey() {
    if (!state.character) return state.baseChatBgKey + 'default';
    if (state.character.id) {
        return state.baseChatBgKey + state.character.id;
    } else {
        return state.baseChatBgKey + generateCharacterId(state.character);
    }
}

// 更新输入框placeholder
function updateInputBoxPlaceholder() {
    if (state.character) {
        const modeName = state.modeConfig[state.currentMode].name;
        state.dom.inputBox.setAttribute('data-placeholder', `${modeName} - 和${state.character.name}聊天...`);
    } else {
        state.dom.inputBox.setAttribute('data-placeholder', '请先导入角色卡...');
    }
    checkAndShowPlaceholder();
}

// 检查和显示placeholder
function checkAndShowPlaceholder() {
    const hasText = state.dom.inputBox.textContent.trim().length > 0;
    if (!hasText) {
        state.dom.inputBox.setAttribute('data-empty', 'true');
    } else {
        state.dom.inputBox.removeAttribute('data-empty');
    }
}

// 更新模式显示
function updateModeDisplay() {
    const mode = state.currentMode;
    const config = state.modeConfig[mode];
    state.dom.modeSwitch.className = `mode-switch mode-${mode}`;
    state.dom.modeSwitch.innerHTML = config.icon + 
        `<div class="mode-indicator"></div>` +
        `<div class="mode-label">${config.name}</div>`;
    state.dom.modeSwitch.style.color = config.color;
    updateInputBoxPlaceholder();
    showToast(`${config.name}`);
}

// 切换模式
function switchMode() {
    const modes = ['online', 'offline', 'story'];
    const currentIndex = modes.indexOf(state.currentMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    state.currentMode = modes[nextIndex];
    state.dom.modeSwitch.classList.add('mode-switch-animate');
    setTimeout(() => {
        state.dom.modeSwitch.classList.remove('mode-switch-animate');
    }, 400);
    updateModeDisplay();
}

// 更新发送按钮状态
function updateSendButtonState(isLoading) {
    if (isLoading) {
        state.dom.sendBtn.classList.add('loading');
        state.sendBtnState = 'loading';
    } else {
        state.dom.sendBtn.classList.remove('loading');
        state.sendBtnState = 'normal';
    }
}

// 全屏模式切换
function toggleFullScreen() {
    if (!document.fullscreenElement) {
        const element = document.documentElement;
        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if (element.mozRequestFullScreen) {
            element.mozRequestFullScreen();
        } else if (element.webkitRequestFullscreen) {
            element.webkitRequestFullscreen();
        } else if (element.msRequestFullscreen) {
            element.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (element.msExitFullscreen) {
            element.msExitFullscreen();
        }
    }
    closeDropdownMenu();
}

// 监听全屏变化事件
function handleFullScreenChange() {
    const isFullScreen = !!(document.fullscreenElement || 
                           document.webkitFullscreenElement || 
                           document.mozFullScreenElement || 
                           document.msFullscreenElement);
    state.isFullScreen = isFullScreen;
    if (isFullScreen) {
        document.body.classList.add('fullscreen-mode');
        state.dom.fullscreenItem.textContent = '退出全屏';
    } else {
        document.body.classList.remove('fullscreen-mode');
        state.dom.fullscreenItem.textContent = '全屏模式';
    }
}

// 切换伪流式开关
function toggleStreaming() {
    state.streamingEnabled = !state.streamingEnabled;
    extension_settings[extensionName].streamingEnabled = state.streamingEnabled;
    saveSettingsDebounced();
    if (state.streamingEnabled) {
        state.dom.streamingToggleItem.textContent = '关闭伪流式';
    } else {
        state.dom.streamingToggleItem.textContent = '开启伪流式';
    }
    closeDropdownMenu();
}

// --- 世界书核心函数 ---
async function writeToWorldBook(entryName, content, keywords = []) {
    if (!window.parent || !window.parent.TavernHelper) {
        console.log("世界书写入: 无TavernHelper");
        return false;
    }
    try {
        const primaryLorebook = await window.parent.TavernHelper.getCurrentCharPrimaryLorebook();
        if (!primaryLorebook) {
            console.log("世界书写入: 无主要世界书");
            return false;
        }
        const entries = await window.parent.TavernHelper.getLorebookEntries(primaryLorebook);
        const existingEntry = entries.find(e => e.comment === entryName);
        const entryData = {
            comment: entryName,
            content: content,
            enabled: true,
            keys: keywords,
            insertion_order: 50
        };
        if (existingEntry) {
            await window.parent.TavernHelper.setLorebookEntries(primaryLorebook, [{ ...existingEntry, ...entryData }]);
        } else {
            await window.parent.TavernHelper.createLorebookEntries(primaryLorebook, [entryData]);
        }
        console.log("世界书写入成功:", entryName);
        return true;
    } catch (e) {
        console.error("世界书写入失败:", e);
        return false;
    }
}

async function clearChatLorebookEntries() {
    if (!window.parent?.TavernHelper) {
        console.log("清理世界书: 无TavernHelper");
        return;
    }
    try {
        const primaryLorebook = await window.parent.TavernHelper.getCurrentCharPrimaryLorebook();
        if (!primaryLorebook) return;
        const entries = await window.parent.TavernHelper.getLorebookEntries(primaryLorebook);
        const chatEntries = entries.filter(e => e.comment.startsWith('CHAT_MEMORY_'));
        if (chatEntries.length > 0) {
            const toDelete = chatEntries.map(e => e.uid);
            await window.parent.TavernHelper.deleteLorebookEntries(primaryLorebook, toDelete);
            console.log("清理世界书: 删除", chatEntries.length, "条记录");
        }
    } catch (e) {
        console.error("清理世界书失败:", e);
    }
}

// --- 用户设定与头像函数 ---
function getUserPersonaFromST() {
    try {
        let name = '';
        let description = '';
        let avatar = '';
        const context = typeof getContext === 'function' ? getContext() : null;
        if (context) {
            name = context.name1 || '';
            avatar = context.user_avatar || '';
        }
        if (!name && typeof name1 !== 'undefined') {
            name = name1;
        }
        if (typeof power_user !== 'undefined') {
            if (power_user.persona_description) {
                description = power_user.persona_description;
            }
            if (power_user.personas && power_user.default_persona) {
                const currentPersona = power_user.default_persona;
                if (power_user.personas[currentPersona]) {
                    description = power_user.personas[currentPersona];
                    if (!name) name = currentPersona;
                }
            }
        }
        if (!name && typeof user_avatar !== 'undefined') {
            name = user_avatar.replace(/\.[^/.]+$/, '');
        }
        if (!description) {
            const personaDescEl = document.querySelector('#persona_description');
            if (personaDescEl && personaDescEl.value) {
                description = personaDescEl.value;
            }
        }
        if (name || description || avatar) {
            return { 
                name: name || '你', 
                description: description || '', 
                avatar: avatar || null
            };
        }
    } catch (err) {
        console.error('获取用户设定失败:', err);
    }
    return null;
}

function getUserAvatarHTML(userName = null) {
    try {
        const context = typeof getContext === 'function' ? getContext() : null;
        const name = userName || state.userInfo.name || context?.name1 || 'User';
        const firstChar = name.charAt(0).toUpperCase();
        const avatarId = 'user-avatar-' + Date.now();
        return `
            <div class="avatar-text">${firstChar}</div>
            <img id="${avatarId}" style="display:none;" onload="document.getElementById('${avatarId}').style.display='block';this.parentElement.querySelector('.avatar-text').style.display='none';" onerror="console.log('用户头像加载失败')">
        `;
    } catch (err) {
        console.error('生成用户头像HTML失败:', err);
        return '<div class="avatar-text">U</div>';
    }
}

function loadUserAvatar() {
    try {
        const avatarElement = document.querySelector('.avatar img');
        if (!avatarElement) return;
        const avatarId = avatarElement.id;
        const context = typeof getContext === 'function' ? getContext() : null;
        let avatarUrl = null;
        const settings = typeof getSettings === 'function' ? getSettings() : {};
        if (settings.userAvatar) {
            avatarUrl = settings.userAvatar;
        } else if (context?.user_avatar) {
            avatarUrl = `/User Avatars/${context.user_avatar}`;
        }
        if (avatarUrl) {
            avatarElement.src = avatarUrl;
        }
    } catch (err) {
        console.error('加载用户头像失败:', err);
    }
}

// --- 聊天记录持久化 ---
function saveChatHistory(chatHistory) {
    try {
        if (chatHistory.length > 1000) {
            chatHistory = chatHistory.slice(-1000);
        }
        const key = getCurrentChatHistoryKey();
        const data = JSON.stringify(chatHistory);
        if (data.length > 4 * 1024 * 1024) {
            while (data.length > 3 * 1024 * 1024 && chatHistory.length > 100) {
                chatHistory.shift();
            }
        }
        localStorage.setItem(key, JSON.stringify(chatHistory));
        return true;
    } catch (err) {
        console.error('聊天记录保存失败:', err);
        try {
            if (chatHistory.length > 500) {
                chatHistory = chatHistory.slice(-500);
                localStorage.setItem(getCurrentChatHistoryKey(), JSON.stringify(chatHistory));
            }
        } catch (e) {
            console.error('清理后保存失败:', e);
        }
        return false;
    }
}

function loadChatHistory() {
    try {
        const stored = localStorage.getItem(getCurrentChatHistoryKey());
        loadAndApplyChatBg();
        if (stored) {
            const history = JSON.parse(stored);
            if (Array.isArray(history)) {
                return history.filter(msg => 
                    msg && typeof msg === 'object' && 
                    'sender' in msg && 'text' in msg
                );
            }
        }
    } catch (err) {
        console.error('聊天记录加载失败:', err);
        loadAndApplyChatBg();
    }
    return [];
}

function addChatRecord(sender, text, replyTo = null) {
    const chatHistory = loadChatHistory();
    const record = {
        sender,
        text,
        replyTo,
        timestamp: new Date().getTime(),
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        mode: state.currentMode
    };
    chatHistory.push(record);
    saveChatHistory(chatHistory);
    return chatHistory;
}

function deleteChatRecord(index) {
    const chatHistory = loadChatHistory();
    if (index >= 0 && index < chatHistory.length) {
        const deleted = chatHistory.splice(index, 1);
        saveChatHistory(chatHistory);
        return { history: chatHistory, deleted: deleted[0] };
    }
    return { history: chatHistory, deleted: null };
}

// --- 聊天背景相关 ---
function saveChatBg(bgBase64) {
    try {
        if (!bgBase64 || !bgBase64.startsWith('data:image')) {
            console.error('无效的base64图片数据');
            return false;
        }
        try {
            const base64Data = bgBase64.split(',')[1];
            if (!base64Data) {
                throw new Error('base64数据格式错误');
            }
            atob(base64Data);
        } catch (e) {
            console.error('base64数据验证失败:', e);
            return false;
        }
        const base64Data = bgBase64.split(',')[1];
        const dataSize = Math.floor(base64Data.length * 0.75);
        if (dataSize > 5 * 1024 * 1024) {
            return false;
        }
        localStorage.setItem(getCurrentChatBgKey(), bgBase64);
        console.log('聊天背景保存成功，大小:', dataSize, 'bytes');
        return true;
    } catch (err) {
        console.error('聊天背景保存失败:', err);
        return false;
    }
}

function loadChatBg() {
    try {
        const storedBg = localStorage.getItem(getCurrentChatBgKey());
        if (storedBg && storedBg.startsWith('data:image')) {
            try {
                const base64Data = storedBg.split(',')[1];
                if (base64Data) {
                    atob(base64Data.substring(0, 100));
                    return storedBg;
                }
            } catch (e) {
                console.error('存储的背景图片数据损坏:', e);
                localStorage.removeItem(getCurrentChatBgKey());
            }
        }
    } catch (err) {
        console.error('聊天背景加载失败:', err);
    }
    return null;
}

function loadAndApplyChatBg() {
    const savedBg = loadChatBg();
    if (savedBg) {
        applyChatBg(savedBg);
    } else {
        state.dom.chatList.style.backgroundImage = 'none';
        state.dom.chatList.style.backgroundColor = 'var(--inner-bg)';
        document.querySelectorAll('.bubble').forEach(bubble => {
            bubble.style.backgroundColor = '';
        });
    }
}

function applyChatBg(bgBase64) {
    if (bgBase64 && bgBase64.startsWith('data:image')) {
        const img = new Image();
        img.onload = function() {
            state.dom.chatList.style.backgroundImage = `url(${bgBase64})`;
            document.querySelectorAll('.bubble').forEach(bubble => {
                const msgElement = bubble.closest('.msg');
                if (msgElement && msgElement.classList.contains('right')) {
                    bubble.style.backgroundColor = 'rgba(38, 161, 94, 0.85)';
                } else {
                    bubble.style.backgroundColor = 'rgba(44, 44, 46, 0.85)';
                }
            });
        };
        img.onerror = function() {
            console.error('背景图片加载失败');
            localStorage.removeItem(getCurrentChatBgKey());
            state.dom.chatList.style.backgroundImage = 'none';
            state.dom.chatList.style.backgroundColor = 'var(--inner-bg)';
        };
        img.src = bgBase64;
    } else {
        state.dom.chatList.style.backgroundImage = 'none';
        state.dom.chatList.style.backgroundColor = 'var(--inner-bg)';
        document.querySelectorAll('.bubble').forEach(bubble => {
            bubble.style.backgroundColor = '';
        });
    }
}

function selectChatBg() {
    state.dom.chatBgInput.style.zIndex = '9999';
    state.dom.chatBgInput.click();
}

function handleChatBgSelect(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        const bgBase64 = e.target.result;
        if (saveChatBg(bgBase64)) {
            applyChatBg(bgBase64);
            showToast('聊天背景已应用');
        }
    };
    reader.onerror = function(e) {
        console.error('图片读取错误:', e);
    };
    reader.readAsDataURL(file);
}

// --- 角色卡解析函数 ---
async function extractCharacterFromPNG(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function (e) {
            try {
                const arrayBuffer = e.target.result;
                const dataView = new DataView(arrayBuffer);
                const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
                for (let i = 0; i < 8; i++) {
                    if (dataView.getUint8(i) !== pngSignature[i]) {
                        throw new Error('不是有效的PNG文件');
                    }
                }
                let offset = 8;
                while (offset < arrayBuffer.byteLength) {
                    const length = dataView.getUint32(offset);
                    const type = String.fromCharCode(
                        dataView.getUint8(offset + 4),
                        dataView.getUint8(offset + 5),
                        dataView.getUint8(offset + 6),
                        dataView.getUint8(offset + 7)
                    );
                    if (type === 'tEXt' || type === 'iTXt') {
                        const chunkData = new Uint8Array(arrayBuffer, offset + 8, length);
                        const text = new TextDecoder('utf-8').decode(chunkData);
                        if (text.startsWith('chara\0')) {
                            const base64Data = text.substring(6);
                            const binaryStr = atob(base64Data);
                            const bytes = new Uint8Array(binaryStr.length);
                            for (let i = 0; i < binaryStr.length; i++) {
                                bytes[i] = binaryStr.charCodeAt(i);
                            }
                            const jsonStr = new TextDecoder('utf-8').decode(bytes);
                            const charData = JSON.parse(jsonStr);
                            const uint8Array = new Uint8Array(arrayBuffer);
                            let binary = '';
                            for (let i = 0; i < uint8Array.length; i++) {
                                binary += String.fromCharCode(uint8Array[i]);
                            }
                            const avatarBase64 = 'data:image/png;base64,' + btoa(binary);
                            resolve({
                                name: charData.name || charData.data?.name || '未知角色',
                                description: charData.description || charData.data?.description || charData.personality || '',
                                avatar: avatarBase64,
                                rawData: charData,
                                fileType: 'png'
                            });
                            return;
                        }
                    }
                    offset += 12 + length;
                }
                throw new Error('PNG中未找到角色卡数据');
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsArrayBuffer(file);
    });
}

async function extractCharacterFromJSON(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const charData = JSON.parse(e.target.result);
                resolve({
                    name: charData.name || charData.data?.name || '未知角色',
                    description: charData.description || charData.data?.description || charData.personality || '',
                    avatar: charData.avatar || null,
                    rawData: charData,
                    fileType: 'json'
                });
            } catch (err) {
                reject(new Error('JSON解析失败'));
            }
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsText(file);
    });
}

async function importCharacterToUI(characterData) {
    try {
        characterData.id = generateCharacterId(characterData);
        const existingKey = getCurrentChatHistoryKey();
        if (state.character && localStorage.getItem(existingKey)) {
            const confirmImport = confirm(`已存在与${state.character.name}的聊天记录，是否覆盖导入新角色卡？\n点击取消将保留现有聊天记录。`);
            if (!confirmImport) {
                showToast("已取消导入");
                return;
            }
        }
        state.dom.chatList.innerHTML = '';
        state.character = characterData;
        state.dom.charNameDisplay.innerText = characterData.name;
        state.dom.emptyTip.style.display = 'none';
        state.dom.inputBox.removeAttribute('disabled');
        state.dom.inputBox.focus();
        updateInputBoxPlaceholder();
        state.dom.statusIndicator.style.display = 'flex';
        updateStatus('online');
        const history = loadChatHistory();
        if (history.length > 0) {
            history.forEach((record, index) => {
                if (record.sender === 'user' && record.mode === 'story') {
                    appendUserMessageStorySeparate(record.text, index, record.replyTo);
                } else if (record.sender === 'char' && record.mode === 'story') {
                    appendStoryCharMessage(record.text, index, record.replyTo);
                } else {
                    appendMsg(record.text, record.sender === 'user', index, record.replyTo, record.mode || 'online');
                }
            });
            showToast(`已加载与${characterData.name}的${history.length}条聊天记录`);
        } else {
            const emptyTip = document.createElement('div');
            emptyTip.className = 'empty-tip';
            emptyTip.innerHTML = `开始和${characterData.name}聊天吧～`;
            state.dom.chatList.appendChild(emptyTip);
        }
    } catch (err) {
        showToast(`导入失败：${err.message}`, 'error');
        console.error('角色卡导入失败:', err);
    }
}

// --- 状态指示器 ---
function updateStatus(status) {
    if (!state.character) return;
    const statusConfig = {
        online: { color: '#07c160', text: '在线' },
        offline: { color: '#ff3b30', text: '离线' }
    };
    const config = statusConfig[status] || statusConfig.online;
    state.dom.statusDot.style.backgroundColor = config.color;
    state.dom.statusText.textContent = config.text;
}

// 处理双引号文本
function processDoubleQuotesText(text) {
    text = text.replace(/("([^"]*)")/g, function(match, p1, p2) {
        return `<span class="double-quote-mark">"</span><span class="double-quote-content">${p2}</span><span class="double-quote-mark">"</span>`;
    });
    text = text.replace(/("([^"]*)")/g, function(match, p1, p2) {
        return `<span class="double-quote-mark">"</span><span class="double-quote-content">${p2}</span><span class="double-quote-mark">"</span>`;
    });
    return text;
}

// 处理引号文本
function processQuotesText(text) {
    text = processDoubleQuotesText(text);
    text = text.replace(/('([^']*)')/g, function(match, p1, p2) {
        return `<span class="quote-mark">'</span><span class="double-quote-content">${p2}</span><span class="quote-mark">'</span>`;
    });
    text = text.replace(/(「([^」]*)」)/g, function(match, p1, p2) {
        return `<span class="quote-mark">「</span><span class="double-quote-content">${p2}</span><span class="quote-mark">」</span>`;
    });
    text = text.replace(/(『([^』]*)』)/g, function(match, p1, p2) {
        return `<span class="double-quote-mark">『</span><span class="double-quote-content">${p2}</span><span class="double-quote-mark">』</span>`;
    });
    text = text.replace(/(《([^》]*)》)/g, function(match, p1, p2) {
        return `<span class="quote-mark">《</span><span class="double-quote-content">${p2}</span><span class="quote-mark">》</span>`;
    });
    text = text.replace(/(〈([^〉]*)〉)/g, function(match, p1, p2) {
        return `<span class="double-quote-mark">〈</span><span class="double-quote-content">${p2}</span><span class="double-quote-mark">〉</span>`;
    });
    return text;
}

// 处理非括号文本
function processNonBracketText(text, mode) {
    text = processQuotesText(text);
    const bracketRegex = /([（(【\[][^）)\]}]*[）)\]])/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = bracketRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push({
                text: text.substring(lastIndex, match.index),
                type: 'normal'
            });
        }
        parts.push({
            text: match[0],
            type: 'bracket'
        });
        lastIndex = bracketRegex.lastIndex;
    }
    if (lastIndex < text.length) {
        parts.push({
            text: text.substring(lastIndex),
            type: 'normal'
        });
    }
    let result = '';
    parts.forEach(part => {
        if (part.type === 'bracket') {
            result += `<span class="bracket-text">${part.text}</span>`;
        } else {
            result += `<span class="normal-text">${part.text}</span>`;
        }
    });
    return result || text;
}

// 小说式故事模式分段
function formatStoryText(text) {
    text = text.trim();
    const lines = text.split('\n');
    let result = '';
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        if (line.match(/^[「"『"'].*[」"』"']$/)) {
            result += `<div class="story-dialogue">${processNonBracketText(line, 'story')}</div>`;
        } else if (line.match(/^（.*）$/) || line.match(/^\(.*\)$/)) {
            result += `<div class="story-action">${processNonBracketText(line, 'story')}</div>`;
        } else if (line.match(/^【.*】$/)) {
            result += `<div class="story-description">${processNonBracketText(line, 'story')}</div>`;
        } else {
            result += `<div class="story-paragraph">${processNonBracketText(line, 'story')}</div>`;
        }
    }
    return result;
}

// --- API调用函数 ---
async function callParentApiForSummary(textToSummarize, promptToUse) {
    if (window.parent && window.parent.TavernHelper && 
        typeof window.parent.TavernHelper.generate === 'function') {
        const tavernGenerateFunc = window.parent.TavernHelper.generate;
        const params = {
            user_input: promptToUse,
            should_stream: false,
            disable_extras: true,
            stop_everything: true
        };
        try {
            console.log("调用AI API...");
            const response = await tavernGenerateFunc(params);
            console.log("AI回复:", response.substring(0, 100) + "...");
            let adjustedResponse = response.trim();
            return adjustedResponse;
        } catch (e) {
            console.error("API调用失败:", e);
            throw new Error('AI生成失败: ' + (e.message || '未知错误'));
        }
    } else {
        console.warn('未检测到TavernHelper，使用模拟回复');
        const charDesc = state.character?.description || '普通友好的角色';
        if (state.currentMode === 'online') {
            const mockReplies = [
                `跟你聊微信还挺有意思的，你刚才说的我都记着啦`,
                `是啊，我也这么觉得呢，不知道你接下来想聊点什么`,
                `你提到的这个点很有意思，我之前都没怎么想过`,
                `哈哈，确实是这样，希望以后能多跟你交流交流`,
                `你说的太对了，完全说到我心坎里去了`
            ];
            const randomCount = Math.floor(Math.random() * 5) + 1;
            return mockReplies.slice(0, randomCount).join('|||');
        } else if (state.currentMode === 'offline') {
            const mockReplies = [
                `（轻轻点头，微笑着看向对方）确实，我也这么觉得。最近的天气真是不错，阳光透过窗户洒进来，暖洋洋的。说起来，昨天我路过公园的时候，看到樱花已经开始绽放了，粉嫩嫩的一片，特别好看。不知道你有没有注意到？如果周末有空的话，我们可以一起去那里散散步，顺便聊聊你刚才提到的那个话题。我觉得在那样轻松的环境下，我们能聊得更深入一些。这段对话让我想起了我们初次见面的情景，那时候也是在这样的午后，阳光正好，微风不燥。`,
                `（思考了一下，手指轻敲桌面）这个问题嘛...我觉得可以从另一个角度考虑。首先，我们需要明确的是，在这种情况下，双方的情绪状态都很重要。就像刚才你说的那样，有时候一个小小的误会可能会引发不必要的矛盾。所以我觉得，在处理这类问题的时候，保持冷静和耐心是关键。当然，每个人的情况都不一样，具体问题还需要具体分析。我们可以找个时间坐下来好好谈谈，把各自的想法都摊开来说清楚。`
            ];
            return mockReplies[Math.floor(Math.random() * mockReplies.length)];
        } else {
            const mockReplies = [
                `在那个阳光明媚的午后，你的一句话仿佛打开了记忆的闸门。时光倒流，我们仿佛又回到了初次见面的那天。那是一个雨后的傍晚，空气里弥漫着泥土和青草的清新气息。你站在街角的咖啡店门口，手里拿着一本泛黄的诗集，雨水打湿了你的发梢，但你的眼神却异常明亮。我们因为避雨而相遇，因为一首诗而相识。如今回想起来，那段时光仿佛被镀上了一层金色的光晕，每一个细节都那么清晰。生命中的每一次相遇都不是偶然，而是命运早已写好的剧本。就像现在，我们坐在这里，聊着过去，畅想着未来，这一切都是最好的安排。窗外，夜幕悄然降临，星光开始点缀深蓝色的天幕。远处传来隐约的钢琴声，为这个夜晚增添了几分浪漫的气息。我多么希望时间能在此刻停留，让我们能永远沉浸在这份宁静与美好之中。可是，我们都知道，时间从不会为谁停留。那么，就让我们珍惜眼前的每一分每一秒，把每一个瞬间都变成永恒的记忆吧。`,
                `夜风轻拂，星光点点。你的话语在寂静中回荡，唤起了深藏在心底的往事。记得那个冬天，雪花纷纷扬扬地落下，覆盖了整个城市。我们一起走在空无一人的街道上，脚下的雪发出咯吱咯吱的响声。你突然停下脚步，抬头望着漫天飞舞的雪花，说这世界真美。那一刻，时间仿佛静止了，我只想永远记住这个瞬间。如今，每当冬天下雪的时候，我都会想起那个夜晚，想起你的侧脸在雪光中的轮廓。有些记忆就像陈年的美酒，时间越久，味道越醇厚。而现在，我们又坐在一起，分享着彼此的故事，这种感觉真的很奇妙。或许，生命的意义就在于这些看似平凡却又珍贵的时刻吧。它们像珍珠一样串联起我们的人生，让每一个日子都闪闪发光。`
            ];
            return mockReplies[Math.floor(Math.random() * mockReplies.length)];
        }
    }
}

// --- 伪流式传输功能 ---
function streamMessage(text, element, speed = 1, callback = null) {
    const textContainer = element.querySelector('.streaming-text') || element.querySelector('.bubble-content') || element.querySelector('.bubble > div:last-child');
    if (!textContainer) return;
    if (!state.streamingEnabled) {
        if (state.currentMode === 'story') {
            const formattedText = formatStoryText(text);
            textContainer.innerHTML = formattedText;
        } else {
            const processedText = processNonBracketText(text, state.currentMode);
            textContainer.innerHTML = processedText;
        }
        state.isStreaming = false;
        if (callback) callback();
        return;
    }
    const originalHtml = textContainer.innerHTML;
    textContainer.innerHTML = '';
    const cursor = document.createElement('span');
    cursor.className = 'streaming-cursor';
    cursor.style.display = 'inline-block';
    cursor.style.width = '2px';
    cursor.style.height = '1em';
    cursor.style.backgroundColor = 'var(--wechat-green)';
    cursor.style.marginLeft = '2px';
    cursor.style.animation = 'blink 1s infinite';
    if (!document.querySelector('style#cursor-style')) {
        const cursorStyle = document.createElement('style');
        cursorStyle.id = 'cursor-style';
        cursorStyle.textContent = `
            @keyframes blink {
                0%, 50% { opacity: 1; }
                51%, 100% { opacity: 0; }
            }
        `;
        document.head.appendChild(cursorStyle);
    }
    let index = 0;
    const chars = text.split('');
    textContainer.appendChild(cursor);
    function typeCharacter() {
        if (index < chars.length) {
            if (cursor.parentNode) {
                cursor.remove();
            }
            const char = chars[index];
            const charSpan = document.createElement('span');
            charSpan.textContent = char;
            charSpan.style.opacity = '0';
            charSpan.style.animation = 'fadeIn 0.1s forwards';
            textContainer.appendChild(charSpan);
            textContainer.appendChild(cursor);
            index++;
            const bubble = element.querySelector('.bubble');
            if (bubble) {
                bubble.style.transition = 'max-width 0.2s ease, transform 0.2s ease';
                bubble.style.transform = 'scale(1.01)';
                setTimeout(() => {
                    bubble.style.transform = 'scale(1)';
                }, 100);
            }
            if (index === 1) {
                element.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
            setTimeout(typeCharacter, speed);
        } else {
            if (cursor.parentNode) {
                cursor.remove();
            }
            if (state.currentMode === 'story') {
                const formattedText = formatStoryText(text);
                textContainer.innerHTML = formattedText;
            } else {
                const processedText = processNonBracketText(text, state.currentMode);
                textContainer.innerHTML = processedText;
            }
            state.isStreaming = false;
            if (callback) callback();
        }
    }
    state.isStreaming = true;
    setTimeout(typeCharacter, 100);
}

// --- 故事模式用户消息 ---
function appendUserMessageStorySeparate(userText, index, replyTo = null) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg story-user user-message-appear`;
    msgDiv.dataset.index = index;
    const msgId = Date.now() + Math.random().toString(36).substr(2, 9);
    msgDiv.dataset.id = msgId;
    let msgContent = '';
    msgContent += `
        <div class="story-user-label">${state.userInfo.name}</div>
        <div class="user-message-content">${processNonBracketText(userText, 'story')}</div>
    `;
    const actionButtons = `
        <div class="msg-action-buttons" id="action-buttons-${msgId}">
            <button class="action-btn regenerate-btn" title="重新生成" data-msg-id="${msgId}" data-index="${index}">
                <span class="tooltip">重新生成</span>
                ⟳
            </button>
            <button class="action-btn edit-btn" title="修改" data-msg-id="${msgId}" data-index="${index}">
                <span class="tooltip">修改</span>
                ✎
            </button>
        </div>
    `;
    msgDiv.innerHTML = msgContent + actionButtons;
    state.dom.chatList.appendChild(msgDiv);
    setTimeout(() => {
        msgDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 10);
    addMsgInteractions(msgDiv, index);
    return msgDiv;
}

// --- 故事模式角色消息 ---
function appendStoryCharMessage(charText, index, replyTo = null) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg story-char`;
    msgDiv.dataset.index = index;
    const msgId = Date.now() + Math.random().toString(36).substr(2, 9);
    msgDiv.dataset.id = msgId;
    let bubbleContent = '';
    if (replyTo) {
        const quotedText = replyTo.text.length > 30 ? replyTo.text.substring(0, 30) + '...' : replyTo.text;
        const quotedSender = replyTo.sender === 'user' ? state.userInfo.name : state.character?.name;
        bubbleContent = `
            <div class="quote-bubble">
                <div class="quote-sender">${quotedSender}</div>
                <div class="quote-content">${quotedText}</div>
            </div>
        `;
    }
    bubbleContent += `
        <div class="story-char-section">
            <div class="story-char-label">${state.character?.name || '角色'}</div>
            <div class="bubble-content">${formatStoryText(charText)}</div>
        </div>
    `;
    const actionButtons = `
        <div class="msg-action-buttons" id="action-buttons-${msgId}">
            <button class="action-btn regenerate-btn" title="重新生成" data-msg-id="${msgId}" data-index="${index}">
                <span class="tooltip">重新生成</span>
                ⟳
            </button>
            <button class="action-btn edit-btn" title="修改" data-msg-id="${msgId}" data-index="${index}">
                <span class="tooltip">修改</span>
                ✎
            </button>
        </div>
    `;
    msgDiv.innerHTML = `
        <div class="bubble">
            ${bubbleContent}
        </div>
        ${actionButtons}
    `;
    state.dom.chatList.appendChild(msgDiv);
    setTimeout(() => {
        msgDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 10);
    addMsgInteractions(msgDiv, index);
    const savedBg = loadChatBg();
    if (savedBg) {
        const bubble = msgDiv.querySelector('.bubble');
        if (bubble) {
            bubble.style.backgroundColor = 'rgba(26, 26, 42, 0.85)';
        }
    }
    return msgDiv;
}

// 故事模式角色消息伪流式显示
function appendStoryCharMessageStreaming(charText, index, replyTo = null) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg story-char`;
    msgDiv.dataset.index = index;
    const msgId = Date.now() + Math.random().toString(36).substr(2, 9);
    msgDiv.dataset.id = msgId;
    let bubbleContent = '';
    if (replyTo) {
        const quotedText = replyTo.text.length > 30 ? replyTo.text.substring(0, 30) + '...' : replyTo.text;
        const quotedSender = replyTo.sender === 'user' ? state.userInfo.name : state.character?.name;
        bubbleContent = `
            <div class="quote-bubble">
                <div class="quote-sender">${quotedSender}</div>
                <div class="quote-content">${quotedText}</div>
            </div>
        `;
    }
    bubbleContent += `
        <div class="story-char-section">
            <div class="story-char-label">${state.character?.name || '角色'}</div>
            <div class="bubble-content"><div class="streaming-text"></div></div>
        </div>
    `;
    const actionButtons = `
        <div class="msg-action-buttons" id="action-buttons-${msgId}">
            <button class="action-btn regenerate-btn" title="重新生成" data-msg-id="${msgId}" data-index="${index}">
                <span class="tooltip">重新生成</span>
                ⟳
            </button>
            <button class="action-btn edit-btn" title="修改" data-msg-id="${msgId}" data-index="${index}">
                <span class="tooltip">修改</span>
                ✎
            </button>
        </div>
    `;
    msgDiv.innerHTML = `
        <div class="bubble">
            ${bubbleContent}
        </div>
        ${actionButtons}
    `;
    state.dom.chatList.appendChild(msgDiv);
    setTimeout(() => {
        msgDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 10);
    addMsgInteractions(msgDiv, index);
    const savedBg = loadChatBg();
    if (savedBg) {
        const bubble = msgDiv.querySelector('.bubble');
        if (bubble) {
            bubble.style.backgroundColor = 'rgba(26, 26, 42, 0.85)';
        }
    }
    return msgDiv;
}

// 普通消息显示函数（带操作按钮）
function appendMsg(text, isMe, index, replyTo = null, mode = 'online') {
    if (mode === 'story') {
        if (isMe) {
            return;
        } else {
            return appendStoryCharMessage(text, index, replyTo);
        }
    }
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg ${isMe ? 'right' : 'left'} ${mode}`;
    msgDiv.dataset.index = index;
    const msgId = Date.now() + Math.random().toString(36).substr(2, 9);
    msgDiv.dataset.id = msgId;
    const displayName = isMe ? state.userInfo.name : state.character?.name || '未知角色';
    let msgHTML = '';
    if (mode === 'offline') {
        let avatarHtml = '';
        if (isMe) {
            avatarHtml = getUserAvatarHTML();
        } else {
            const charAvatar = state.character?.avatar || 'https://picsum.photos/id/64/200/200';
            const firstChar = displayName.charAt(0).toUpperCase();
            const avatarId = 'char-avatar-' + Date.now();
            avatarHtml = `
                <div class="avatar-text">${firstChar}</div>
                <img id="${avatarId}" src="${charAvatar}" alt="${displayName}" 
                     onload="document.getElementById('${avatarId}').style.display='block';this.parentElement.querySelector('.avatar-text').style.display='none';" 
                     onerror="console.log('角色头像加载失败')" style="display:none;">
            `;
        }
        let bubbleContent = '';
        if (replyTo) {
            const quotedText = replyTo.text.length > 30 ? replyTo.text.substring(0, 30) + '...' : replyTo.text;
            const quotedSender = replyTo.sender === 'user' ? state.userInfo.name : state.character?.name;
            bubbleContent = `
                <div class="quote-bubble">
                    <div class="quote-sender">${quotedSender}</div>
                    <div class="quote-content">${quotedText}</div>
                </div>
                <div class="bubble-content">${processNonBracketText(text, 'offline')}</div>
            `;
        } else {
            bubbleContent = `<div class="bubble-content">${processNonBracketText(text, 'offline')}</div>`;
        }
        msgHTML = `
            <div class="avatar">
                ${avatarHtml}
            </div>
            <div class="bubble">
                ${bubbleContent}
            </div>
            ${isMe ? '<div class="msg-status">✓</div>' : ''}
        `;
    } else {
        let avatarHtml = '';
        if (isMe) {
            avatarHtml = getUserAvatarHTML();
        } else {
            const charAvatar = state.character?.avatar || 'https://picsum.photos/id/64/200/200';
            const firstChar = displayName.charAt(0).toUpperCase();
            const avatarId = 'char-avatar-' + Date.now();
            avatarHtml = `
                <div class="avatar-text">${firstChar}</div>
                <img id="${avatarId}" src="${charAvatar}" alt="${displayName}" 
                     onload="document.getElementById('${avatarId}').style.display='block';this.parentElement.querySelector('.avatar-text').style.display='none';" 
                     onerror="console.log('角色头像加载失败')" style="display:none;">
            `;
        }
        let bubbleContent = '';
        if (replyTo) {
            const quotedText = replyTo.text.length > 30 ? replyTo.text.substring(0, 30) + '...' : replyTo.text;
            const quotedSender = replyTo.sender === 'user' ? state.userInfo.name : state.character?.name;
            bubbleContent = `
                <div class="reply-bubble" data-reply-id="${replyTo.id || ''}">
                    <div class="reply-sender">${quotedSender}</div>
                    <div class="reply-content">${quotedText}</div>
                </div>
                <div>${processNonBracketText(text, 'online')}</div>
            `;
        } else {
            bubbleContent = processNonBracketText(text, 'online');
        }
        msgHTML = `
            <div class="avatar">
                ${avatarHtml}
            </div>
            <div class="bubble">
                ${bubbleContent}
            </div>
            ${isMe ? '<div class="msg-status">✓</div>' : ''}
        `;
    }
    const actionButtons = `
        <div class="msg-action-buttons" id="action-buttons-${msgId}">
            <button class="action-btn regenerate-btn" title="重新生成" data-msg-id="${msgId}" data-index="${index}">
                <span class="tooltip">重新生成</span>
                ⟳
            </button>
            <button class="action-btn edit-btn" title="修改" data-msg-id="${msgId}" data-index="${index}">
                <span class="tooltip">修改</span>
                ✎
            </button>
        </div>
    `;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false
    });
    let timeSeparator = '';
    if (mode === 'online') {
        if (state.lastMessageTime) {
            const timeDiff = now - state.lastMessageTime;
            if (timeDiff > 5 * 60 * 1000) {
                timeSeparator = `<div class="msg-time">${timeStr}</div>`;
            }
        } else {
            timeSeparator = `<div class="msg-time">${timeStr}</div>`;
        }
    }
    state.lastMessageTime = now;
    msgDiv.innerHTML = msgHTML + actionButtons + timeSeparator;
    state.dom.chatList.appendChild(msgDiv);
    setTimeout(() => {
        msgDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 10);
    addMsgInteractions(msgDiv, index);
    const savedBg = loadChatBg();
    if (savedBg) {
        const bubble = msgDiv.querySelector('.bubble');
        if (bubble) {
            if (mode === 'online') {
                if (isMe) {
                    bubble.style.backgroundColor = 'rgba(38, 161, 94, 0.85)';
                } else {
                    bubble.style.backgroundColor = 'rgba(44, 44, 46, 0.85)';
                }
            }
        }
    }
    if (isMe) {
        setTimeout(loadUserAvatar, 100);
    }
}

// 伪流式消息显示函数（带操作按钮）
function appendMsgStreaming(text, isMe, index, replyTo = null, mode = 'online') {
    if (mode === 'story') {
        if (isMe) {
            return null;
        } else {
            return appendStoryCharMessageStreaming(text, index, replyTo);
        }
    }
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg ${isMe ? 'right' : 'left'} ${mode}`;
    msgDiv.dataset.index = index;
    const msgId = Date.now() + Math.random().toString(36).substr(2, 9);
    msgDiv.dataset.id = msgId;
    const displayName = isMe ? state.userInfo.name : state.character?.name || '未知角色';
    let msgHTML = '';
    if (mode === 'offline') {
        let avatarHtml = '';
        if (isMe) {
            avatarHtml = getUserAvatarHTML();
        } else {
            const charAvatar = state.character?.avatar || 'https://picsum.photos/id/64/200/200';
            const firstChar = displayName.charAt(0).toUpperCase();
            const avatarId = 'char-avatar-' + Date.now();
            avatarHtml = `
                <div class="avatar-text">${firstChar}</div>
                <img id="${avatarId}" src="${charAvatar}" alt="${displayName}" 
                     onload="document.getElementById('${avatarId}').style.display='block';this.parentElement.querySelector('.avatar-text').style.display='none';" 
                     onerror="console.log('角色头像加载失败')" style="display:none;">
            `;
        }
        let bubbleContent = '';
        if (replyTo) {
            const quotedText = replyTo.text.length > 30 ? replyTo.text.substring(0, 30) + '...' : replyTo.text;
            const quotedSender = replyTo.sender === 'user' ? state.userInfo.name : state.character?.name;
            bubbleContent = `
                <div class="quote-bubble">
                    <div class="quote-sender">${quotedSender}</div>
                    <div class="quote-content">${quotedText}</div>
                </div>
            `;
        }
        bubbleContent += `<div class="bubble-content streaming-text"></div>`;
        msgHTML = `
            <div class="avatar">
                ${avatarHtml}
            </div>
            <div class="bubble">
                ${bubbleContent}
            </div>
            ${isMe ? '<div class="msg-status">✓</div>' : ''}
        `;
    } else {
        let avatarHtml = '';
        if (isMe) {
            avatarHtml = getUserAvatarHTML();
        } else {
            const charAvatar = state.character?.avatar || 'https://picsum.photos/id/64/200/200';
            const firstChar = displayName.charAt(0).toUpperCase();
            const avatarId = 'char-avatar-' + Date.now();
            avatarHtml = `
                <div class="avatar-text">${firstChar}</div>
                <img id="${avatarId}" src="${charAvatar}" alt="${displayName}" 
                     onload="document.getElementById('${avatarId}').style.display='block';this.parentElement.querySelector('.avatar-text').style.display='none';" 
                     onerror="console.log('角色头像加载失败')" style="display:none;">
            `;
        }
        let bubbleContent = '';
        if (replyTo) {
            const quotedText = replyTo.text.length > 30 ? replyTo.text.substring(0, 30) + '...' : replyTo.text;
            const quotedSender = replyTo.sender === 'user' ? state.userInfo.name : state.character?.name;
            bubbleContent = `
                <div class="reply-bubble" data-reply-id="${replyTo.id || ''}">
                    <div class="reply-sender">${quotedSender}</div>
                    <div class="reply-content">${quotedText}</div>
                </div>
            `;
        }
        bubbleContent += `<div class="streaming-text"></div>`;
        msgHTML = `
            <div class="avatar">
                ${avatarHtml}
            </div>
            <div class="bubble">
                ${bubbleContent}
            </div>
            ${isMe ? '<div class="msg-status">✓</div>' : ''}
        `;
    }
    const actionButtons = `
        <div class="msg-action-buttons" id="action-buttons-${msgId}">
            <button class="action-btn regenerate-btn" title="重新生成" data-msg-id="${msgId}" data-index="${index}">
                <span class="tooltip">重新生成</span>
                ⟳
            </button>
            <button class="action-btn edit-btn" title="修改" data-msg-id="${msgId}" data-index="${index}">
                <span class="tooltip">修改</span>
                ✎
            </button>
        </div>
    `;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false
    });
    let timeSeparator = '';
    if (mode === 'online') {
        if (state.lastMessageTime) {
            const timeDiff = now - state.lastMessageTime;
            if (timeDiff > 5 * 60 * 1000) {
                timeSeparator = `<div class="msg-time">${timeStr}</div>`;
            }
        } else {
            timeSeparator = `<div class="msg-time">${timeStr}</div>`;
        }
    }
    state.lastMessageTime = now;
    msgDiv.innerHTML = msgHTML + actionButtons + timeSeparator;
    state.dom.chatList.appendChild(msgDiv);
    setTimeout(() => {
        msgDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 10);
    addMsgInteractions(msgDiv, index);
    const savedBg = loadChatBg();
    if (savedBg) {
        const bubble = msgDiv.querySelector('.bubble');
        if (bubble) {
            if (mode === 'online') {
                if (isMe) {
                    bubble.style.backgroundColor = 'rgba(38, 161, 94, 0.85)';
                } else {
                    bubble.style.backgroundColor = 'rgba(44, 44, 46, 0.85)';
                }
            }
        }
    }
    if (isMe) {
        setTimeout(loadUserAvatar, 100);
    }
    return msgDiv;
}

// 显示消息操作按钮
function showMsgActionButtons(msgId) {
    document.querySelectorAll('.msg.show-actions').forEach(msg => {
        msg.classList.remove('show-actions');
    });
    const msgElement = document.querySelector(`.msg[data-id="${msgId}"]`);
    if (msgElement) {
        msgElement.classList.add('show-actions');
        state.activeMessageId = msgId;
    }
}

// 隐藏所有消息操作按钮
function hideAllMsgActionButtons() {
    document.querySelectorAll('.msg.show-actions').forEach(msg => {
        msg.classList.remove('show-actions');
    });
    state.activeMessageId = null;
}

// 重新生成消息
async function regenerateMessage(msgIndex) {
    const chatHistory = loadChatHistory();
    if (msgIndex < 0 || msgIndex >= chatHistory.length) return;
    const targetMsg = chatHistory[msgIndex];
    const isUserMsg = targetMsg.sender === 'user';
    if (isUserMsg) {
        const newHistory = chatHistory.slice(0, msgIndex);
        saveChatHistory(newHistory);
        state.dom.chatList.innerHTML = '';
        state.messageListeners.forEach((listeners, element) => {
            removeMsgInteractions(element);
        });
        state.messageListeners.clear();
        state.lastMessageTime = null;
        const updatedHistory = loadChatHistory();
        updatedHistory.forEach((record, i) => {
            if (record.sender === 'user' && record.mode === 'story') {
                appendUserMessageStorySeparate(record.text, i, record.replyTo);
            } else if (record.sender === 'char' && record.mode === 'story') {
                appendStoryCharMessage(record.text, i, record.replyTo);
            } else {
                appendMsg(record.text, record.sender === 'user', i, record.replyTo, record.mode || 'online');
            }
        });
        state.isGenerating = true;
        state.dom.sendBtn.disabled = true;
        updateSendButtonState(true);
        try {
            state.dom.inputBox.textContent = targetMsg.text;
            state.dom.footerBar.classList.add('has-text');
            state.dom.sendBtn.disabled = false;
            await sendMessage();
        } catch (e) {
            console.error("重新生成失败:", e);
            showToast("重新生成失败", "error");
        } finally {
            state.isGenerating = false;
            updateSendButtonState(false);
        }
    } else {
        const newHistory = chatHistory.slice(0, msgIndex);
        saveChatHistory(newHistory);
        state.dom.chatList.innerHTML = '';
        state.messageListeners.forEach((listeners, element) => {
            removeMsgInteractions(element);
        });
        state.messageListeners.clear();
        state.lastMessageTime = null;
        const updatedHistory = loadChatHistory();
        updatedHistory.forEach((record, i) => {
            if (record.sender === 'user' && record.mode === 'story') {
                appendUserMessageStorySeparate(record.text, i, record.replyTo);
            } else if (record.sender === 'char' && record.mode === 'story') {
                appendStoryCharMessage(record.text, i, record.replyTo);
            } else {
                appendMsg(record.text, record.sender === 'user', i, record.replyTo, record.mode || 'online');
            }
        });
        const previousUserMsg = updatedHistory[updatedHistory.length - 1];
        if (previousUserMsg && previousUserMsg.sender === 'user') {
            state.isGenerating = true;
            state.dom.sendBtn.disabled = true;
            updateSendButtonState(true);
            try {
                const currentIndex = updatedHistory.length;
                addChatRecord('char', targetMsg.text, targetMsg.replyTo);
                if (targetMsg.mode === 'story') {
                    const charMsgElement = appendStoryCharMessageStreaming(targetMsg.text, currentIndex, targetMsg.replyTo);
                    setTimeout(() => {
                        streamMessage(targetMsg.text, charMsgElement, state.streamingSpeed, () => {
                            const bubble = charMsgElement.querySelector('.bubble');
                            if (bubble) {
                                bubble.style.transition = 'max-width 0.3s ease, transform 0.3s ease';
                                bubble.style.transform = 'scale(1)';
                            }
                        });
                    }, 400);
                } else {
                    const msgElement = appendMsgStreaming(targetMsg.text, false, currentIndex, targetMsg.replyTo, targetMsg.mode || 'online');
                    setTimeout(() => {
                        streamMessage(targetMsg.text, msgElement, state.streamingSpeed, () => {
                            const bubble = msgElement.querySelector('.bubble');
                            if (bubble) {
                                bubble.style.transition = 'max-width 0.3s ease, transform 0.3s ease';
                                bubble.style.transform = 'scale(1)';
                            }
                        });
                    }, 400);
                }
                showToast("消息已重新生成");
            } catch (e) {
                console.error("重新生成失败:", e);
                showToast("重新生成失败", "error");
            } finally {
                state.isGenerating = false;
                updateSendButtonState(false);
            }
        }
    }
    hideAllMsgActionButtons();
}

// 修改消息
function editMessage(msgIndex) {
    const chatHistory = loadChatHistory();
    if (msgIndex < 0 || msgIndex >= chatHistory.length) return;
    const targetMsg = chatHistory[msgIndex];
    const isUserMsg = targetMsg.sender === 'user';
    if (isUserMsg) {
        const newHistory = chatHistory.slice(0, msgIndex);
        saveChatHistory(newHistory);
        state.dom.chatList.innerHTML = '';
        state.messageListeners.forEach((listeners, element) => {
            removeMsgInteractions(element);
        });
        state.messageListeners.clear();
        state.lastMessageTime = null;
        const updatedHistory = loadChatHistory();
        updatedHistory.forEach((record, i) => {
            if (record.sender === 'user' && record.mode === 'story') {
                appendUserMessageStorySeparate(record.text, i, record.replyTo);
            } else if (record.sender === 'char' && record.mode === 'story') {
                appendStoryCharMessage(record.text, i, record.replyTo);
            } else {
                appendMsg(record.text, record.sender === 'user', i, record.replyTo, record.mode || 'online');
            }
        });
        state.dom.inputBox.textContent = targetMsg.text;
        state.dom.footerBar.classList.add('has-text');
        state.dom.sendBtn.disabled = false;
        state.dom.inputBox.focus();
        showToast("消息已放入输入框，可修改后发送");
    } else {
        showToast("AI消息不支持修改，请重新生成", "warning");
    }
    hideAllMsgActionButtons();
}

function addMsgInteractions(element, index) {
    const bubble = element.querySelector('.bubble') || element.querySelector('.user-message-content') || element;
    if (!bubble) return;
    const listeners = [];
    const clickHandler = (e) => {
        if (e.target.closest('.action-btn')) {
            return;
        }
        if (state.dom.msgActions.style.display === 'block') {
            closeMsgMenu();
        }
        const msgId = element.dataset.id;
        if (msgId === state.activeMessageId) {
            hideAllMsgActionButtons();
        } else {
            showMsgActionButtons(msgId);
        }
        e.stopPropagation();
    };
    bubble.addEventListener('click', clickHandler);
    listeners.push({ type: 'click', handler: clickHandler });
    const contextMenuHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideAllMsgActionButtons();
        showMsgMenu(e.clientX, e.clientY, index);
    };
    bubble.addEventListener('contextmenu', contextMenuHandler);
    listeners.push({ type: 'contextmenu', handler: contextMenuHandler });
    let pressTimer;
    const touchStartHandler = (e) => {
        pressTimer = setTimeout(() => {
            e.preventDefault();
            const touch = e.touches[0] || e.changedTouches[0];
            hideAllMsgActionButtons();
            showMsgMenu(touch.clientX, touch.clientY, index);
        }, 500);
    };
    const touchEndHandler = () => {
        clearTimeout(pressTimer);
    };
    const touchMoveHandler = () => {
        clearTimeout(pressTimer);
    };
    bubble.addEventListener('touchstart', touchStartHandler, { passive: false });
    bubble.addEventListener('touchend', touchEndHandler);
    bubble.addEventListener('touchmove', touchMoveHandler);
    listeners.push(
        { type: 'touchstart', handler: touchStartHandler },
        { type: 'touchend', handler: touchEndHandler },
        { type: 'touchmove', handler: touchMoveHandler }
    );
    state.messageListeners.set(element, listeners);
    const regenerateBtn = element.querySelector('.regenerate-btn');
    const editBtn = element.querySelector('.edit-btn');
    if (regenerateBtn) {
        const regenerateHandler = (e) => {
            e.stopPropagation();
            const msgIndex = parseInt(regenerateBtn.dataset.index);
            regenerateMessage(msgIndex);
        };
        regenerateBtn.addEventListener('click', regenerateHandler);
        listeners.push({ type: 'click', handler: regenerateHandler, element: regenerateBtn });
    }
    if (editBtn) {
        const editHandler = (e) => {
            e.stopPropagation();
            const msgIndex = parseInt(editBtn.dataset.index);
            editMessage(msgIndex);
        };
        editBtn.addEventListener('click', editHandler);
        listeners.push({ type: 'click', handler: editHandler, element: editBtn });
    }
}

function removeMsgInteractions(element) {
    const listeners = state.messageListeners.get(element);
    if (listeners) {
        listeners.forEach(({ type, handler, element: targetElement }) => {
            if (targetElement) {
                targetElement.removeEventListener(type, handler);
            } else {
                element.removeEventListener(type, handler);
            }
        });
        state.messageListeners.delete(element);
    }
}

function showMsgMenu(x, y, index) {
    state.msgMenuTarget = index;
    const menuWidth = 120;
    const menuHeight = 132;
    let adjustedX = x;
    let adjustedY = y;
    if (x + menuWidth > window.innerWidth) {
        adjustedX = window.innerWidth - menuWidth - 10;
    }
    if (y + menuHeight > window.innerHeight) {
        adjustedY = window.innerHeight - menuHeight - 10;
    }
    adjustedX = Math.max(10, Math.min(adjustedX, window.innerWidth - menuWidth - 10));
    adjustedY = Math.max(10, Math.min(adjustedY, window.innerHeight - menuHeight - 10));
    state.dom.msgActions.style.left = adjustedX + 'px';
    state.dom.msgActions.style.top = adjustedY + 'px';
    state.dom.msgActions.style.display = 'block';
    setTimeout(() => {
        document.addEventListener('click', closeMsgMenuOnClick);
        document.addEventListener('contextmenu', closeMsgMenuOnClick);
    }, 10);
}

function closeMsgMenu() {
    state.dom.msgActions.style.display = 'none';
    state.msgMenuTarget = -1;
    document.removeEventListener('click', closeMsgMenuOnClick);
    document.removeEventListener('contextmenu', closeMsgMenuOnClick);
}

function closeMsgMenuOnClick(e) {
    if (!state.dom.msgActions.contains(e.target)) {
        closeMsgMenu();
    }
}

// 聊天核心功能
async function sendMessage() {
    if (state.isGenerating || !state.character) return;
    const text = state.dom.inputBox.textContent.trim();
    if (!text) return;
    state.isGenerating = true;
    state.dom.sendBtn.disabled = true;
    updateSendButtonState(true);
    try {
        const emptyTip = state.dom.chatList.querySelector('.empty-tip');
        if (emptyTip) emptyTip.remove();
        const historyCount = loadChatHistory().length;
        if (state.currentMode === 'story') {
            const userMsgIndex = historyCount;
            addChatRecord('user', text, state.replyingTo);
            appendUserMessageStorySeparate(text, userMsgIndex, state.replyingTo);
        } else {
            addChatRecord('user', text, state.replyingTo);
            appendMsg(text, true, historyCount, state.replyingTo, state.currentMode);
        }
        state.dom.inputBox.textContent = '';
        state.dom.footerBar.classList.remove('has-text');
        state.dom.sendBtn.disabled = true;
        if (state.replyingTo) {
            clearReply();
        }
        checkAndShowPlaceholder();
        await new Promise(resolve => setTimeout(resolve, 300));
        const chatHistory = loadChatHistory();
        const historyText = chatHistory.slice(-8).map(record => {
            const senderName = record.sender === 'user' ? state.userInfo.name : state.character.name;
            const content = record.replyTo ? `[回复:${record.replyTo.text.slice(0, 20)}...]${record.text}` : record.text;
            return `${senderName}：${content}`;
        }).join('\n');
        let lorebookMemory = '无额外记忆';
        if (window.parent?.TavernHelper) {
            try {
                const primaryLorebook = await window.parent.TavernHelper.getCurrentCharPrimaryLorebook();
                if (primaryLorebook) {
                    const entries = await window.parent.TavernHelper.getLorebookEntries(primaryLorebook);
                    const chatEntries = entries.filter(e => e.comment.startsWith('CHAT_MEMORY_'));
                    if (chatEntries.length > 0) {
                        lorebookMemory = chatEntries.slice(-3).map(e => e.content).join('；');
                    }
                }
            } catch (e) {
                console.error("读取世界书失败:", e);
            }
        }
        const userDesc = state.userInfo.description ? `用户设定：${state.userInfo.description}` : '用户无特殊设定';
        let charPrompt = '';
        if (state.currentMode === 'online') {
            charPrompt = `[系统指令：
角色：你是${state.character.name}，正在和${state.userInfo.name}聊微信
角色设定：${state.character.description || '友好、自然的聊天风格'}
${userDesc}
聊天历史：
${historyText}
世界书记忆：
${lorebookMemory}
回复要求：
1. 生成1-5条微信消息回复，每条用|||分隔
2. 每条消息严格控制在100字以内
3. 只输出纯文本对话内容，不要任何括号、动作描述、心理描写
4. 回复要简短自然，像真实微信聊天
5. 不要使用任何格式标记或符号
6. 如果用户引用了消息，请自然地回应
${state.userInfo.name}说：${text}
${state.character.name}的回复：`;
        } else if (state.currentMode === 'offline') {
            charPrompt = `[系统指令：
角色：你是${state.character.name}，正在和${state.userInfo.name}面对面交流
角色设定：${state.character.description || '友好、自然的聊天风格'}
${userDesc}
聊天历史：
${historyText}
世界书记忆：
${lorebookMemory}
回复要求：
1. 只生成1条回复，不要用|||分隔
2. 回复长度严格控制在50-200字之间（必须达到50字以上，不超过200字）
3. 回复可以包含适当的动作描述、神态描写、场景氛围，使用括号括起来
4. 回复要生动自然，符合角色设定
5. 注意保持对话的连贯性和自然度
6. 确保回复有足够的细节和情感表达
7. 字数必须达标，如果不够请补充细节
${state.userInfo.name}说：${text}
${state.character.name}的回复：`;
        } else if (state.currentMode === 'story') {
            charPrompt = `[系统指令：
角色：你是一位专业的叙事者，正在根据用户提供的文字进行故事扩展和续写
用户提供的文字：${text}
扩展要求：
1. 基于用户提供的文字内容，进行故事扩展和续写
2. 强化叙事性、细节丰富度、情节连贯性
3. 回复长度严格控制在200-1000字之间
4. 可以适当展开故事背景、情感描写、环境氛围
5. 保持文学性和故事性，但不要过于冗长
6. 不要以对话形式回复，而是以叙述者的身份继续故事
7. 不要将用户输入视为对话，而是视为故事的一部分
8. 直接续写故事，不要使用"她说"、"他回答"等对话标记
9. 字数必须达标，如果不够请补充细节描写
故事背景（角色设定）：
${state.character.description || '具有深度和个性的角色'}
聊天历史（最近的故事发展）：
${historyText}
世界书记忆（故事关键点）：
${lorebookMemory}
基于以上信息，请续写故事：`;
        }
        const response = await callParentApiForSummary(text, charPrompt);
        let cleanResponse = response;
        if (state.currentMode === 'online') {
            cleanResponse = response.replace(/[（()）【】\[\]{}《》]/g, '');
        }
        const replies = cleanResponse.split('|||')
            .map(msg => msg.trim())
            .filter(msg => msg.length > 0);
        if (replies.length === 0) {
            throw new Error('AI未生成有效回复');
        }
        const replyText = replies.slice(0, 3).join('；');
        await writeToWorldBook(
            `CHAT_MEMORY_${new Date().getTime()}`,
            `[${state.modeConfig[state.currentMode].name}]聊天要点：${text.slice(0, 50)}...；${replyText.slice(0, 50)}...`,
            [state.userInfo.name, state.modeConfig[state.currentMode].name, state.character.name, new Date().toLocaleDateString('zh-CN')]
        );
        if (state.currentMode === 'story') {
            const currentIndex = loadChatHistory().length;
            addChatRecord('char', replies[0]);
            const charMsgElement = appendStoryCharMessageStreaming(replies[0], currentIndex, state.replyingTo);
            setTimeout(() => {
                streamMessage(replies[0], charMsgElement, state.streamingSpeed, () => {
                    const bubble = charMsgElement.querySelector('.bubble');
                    if (bubble) {
                        bubble.style.transition = 'max-width 0.3s ease, transform 0.3s ease';
                        bubble.style.transform = 'scale(1)';
                    }
                });
            }, 400);
        } else {
            for (let i = 0; i < replies.length; i++) {
                const reply = replies[i];
                const currentIndex = loadChatHistory().length;
                addChatRecord('char', reply);
                await new Promise(resolve => {
                    const msgElement = appendMsgStreaming(reply, false, currentIndex, null, state.currentMode);
                    setTimeout(() => {
                        streamMessage(reply, msgElement, state.streamingSpeed, () => {
                            const bubble = msgElement.querySelector('.bubble');
                            if (bubble) {
                                bubble.style.transition = 'max-width 0.3s ease, transform 0.3s ease';
                                bubble.style.transform = 'scale(1)';
                            }
                            resolve();
                        });
                    }, 400 + i * 500);
                });
            }
        }
        updateStatus('online');
    } catch (e) {
        console.error("发送消息失败:", e);
        const errorIndex = loadChatHistory().length;
        const errorMsg = e.message.includes('网络') ? '网络连接失败，请检查网络后重试' : 
                       e.message.includes('AI') ? 'AI生成失败，请稍后重试' : 
                       '发送失败，请重试';
        if (state.currentMode === 'story') {
            addChatRecord('char', errorMsg);
            const errorMsgElement = appendStoryCharMessageStreaming(errorMsg, errorIndex, state.replyingTo);
            streamMessage(errorMsg, errorMsgElement, state.streamingSpeed);
        } else {
            addChatRecord('char', errorMsg);
            const errorMsgElement = appendMsgStreaming(errorMsg, false, errorIndex, null, state.currentMode);
            streamMessage(errorMsg, errorMsgElement, state.streamingSpeed);
        }
        updateStatus('offline');
        setTimeout(() => {
            if (state.character) updateStatus('online');
        }, 5000);
    } finally {
        state.isGenerating = false;
        updateSendButtonState(false);
    }
}

// 引用回复功能
function setReplyTo(msg, index) {
    state.replyingTo = {
        index: index,
        sender: msg.sender,
        text: msg.text,
        id: msg.id || Date.now().toString()
    };
    const senderName = msg.sender === 'user' ? state.userInfo.name : state.character?.name;
    const previewText = msg.text.length > 30 ? msg.text.substring(0, 30) + '...' : msg.text;
    state.dom.replyPreviewContent.textContent = `回复 ${senderName}: ${previewText}`;
    state.dom.replyPreview.style.display = 'flex';
}

function clearReply() {
    state.replyingTo = null;
    state.dom.replyPreview.style.display = 'none';
}

// 导出聊天记录
function exportChatHistory() {
    if (!state.character) {
        showToast('请先导入角色卡', 'error');
        return;
    }
    const chatHistory = loadChatHistory();
    if (chatHistory.length === 0) {
        showToast('没有聊天记录可导出', 'error');
        return;
    }
    const cleanFileName = (str) => {
        return str.replace(/[\/\\:*?"<>|]/g, '_');
    };
    const exportData = {
        character: state.character.name,
        exportDate: new Date().toISOString(),
        user: state.userInfo.name,
        messageCount: chatHistory.length,
        messages: chatHistory.map(msg => ({
            time: new Date(msg.timestamp).toLocaleString('zh-CN'),
            sender: msg.sender === 'user' ? state.userInfo.name : state.character.name,
            text: msg.text,
            replyTo: msg.replyTo ? {
                sender: msg.replyTo.sender === 'user' ? state.userInfo.name : state.character.name,
                text: msg.replyTo.text
            } : null,
            mode: msg.mode || 'online'
        }))
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `聊天记录_${cleanFileName(state.character.name)}_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`已导出${chatHistory.length}条聊天记录`);
}

// 删除全部聊天
async function deleteAllChats() {
    try {
        localStorage.removeItem(getCurrentChatHistoryKey());
        state.dom.chatList.innerHTML = '';
        state.messageListeners.forEach((listeners, element) => {
            removeMsgInteractions(element);
        });
        state.messageListeners.clear();
        state.lastMessageTime = null;
        state.storyUserInputCache = null;
        if (state.character) {
            const emptyTip = document.createElement('div');
            emptyTip.className = 'empty-tip';
            emptyTip.innerHTML = `开始和${state.character.name}聊天吧～`;
            state.dom.chatList.appendChild(emptyTip);
        } else {
            state.dom.emptyTip.style.display = 'block';
        }
        await clearChatLorebookEntries();
        state.dom.confirmModal.style.display = 'none';
        closeDropdownMenu();
        showToast('全部聊天记录已删除');
    } catch (err) {
        console.error('删除聊天记录失败:', err);
        showToast('删除失败，请重试', 'error');
    }
}

function showToast(message, type = 'success') {
    if (!state.dom.toast) return;
    state.dom.toast.textContent = message;
    state.dom.toast.style.backgroundColor = type === 'error' ? 'rgba(255,59,48,0.8)' : 
                                     type === 'warning' ? 'rgba(255,204,0,0.8)' : 
                                     'rgba(0,0,0,0.8)';
    state.dom.toast.style.display = 'block';
    setTimeout(() => {
        state.dom.toast.style.display = 'none';
    }, 2000);
}

// --- 下拉菜单控制 ---
function toggleDropdownMenu() {
    state.dom.dropdownMenu.style.display = state.dom.dropdownMenu.style.display === 'block' ? 'none' : 'block';
}

function closeDropdownMenu() {
    state.dom.dropdownMenu.style.display = 'none';
}

// 插件加载入口
jQuery(async () => {
    // 加载设置面板HTML
    const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
    $("#extensions_settings").append(settingsHtml);

    // 绑定设置面板事件
    $("#open_wechat_window").on("click", openWechatWindow);
    $("#close_wechat_window").on("click", closeWechatWindow);
    $("#wechat_auto_open").on("input", onAutoOpenChange);

    // 加载插件设置
    await loadSettings();
});
