const express = require('express');
const app = express();
// 使用环境变量端口（云托管平台会自动设置），本地开发默认3000
const port = process.env.PORT || 3000;
const path = require('path');
const fs = require('fs');

// 确保 data 目录存在（适配云托管平台）
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// 中间件配置
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS配置 - 允许前端跨域访问
app.use((req, res, next) => {
    const allowedOrigins = ['http://localhost:3001', 'http://localhost:3002'];
    const origin = req.headers.origin;
    
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // 处理预检请求
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// 提供静态文件服务（前端页面）
app.use(express.static(path.join(__dirname, '..')));

// 内存存储用户数据
let users = [];
let userIdCounter = 1;

// 内存存储预约数据
let bookings = [];
let bookingIdCounter = 1;

// 存储登录会话
let sessions = {};

// 存储评分数据
let ratings = [];
let ratingIdCounter = 1;

// 测试模式相关变量
let testMode = false;
let virtualTime = null;

// 数据持久化函数
function saveData() {
    try {
        // 保存用户数据
        fs.writeFileSync(path.join(__dirname, 'data', 'users.json'), JSON.stringify(users, null, 2));
        
        // 保存预约数据
        fs.writeFileSync(path.join(__dirname, 'data', 'bookings.json'), JSON.stringify(bookings, null, 2));
        
        // 保存评分数据
        fs.writeFileSync(path.join(__dirname, 'data', 'ratings.json'), JSON.stringify(ratings, null, 2));
        
        // 保存计数器数据
        const counters = {
            userIdCounter,
            bookingIdCounter,
            ratingIdCounter
        };
        fs.writeFileSync(path.join(__dirname, 'data', 'counters.json'), JSON.stringify(counters, null, 2));
        
        console.log('数据保存成功');
    } catch (error) {
        console.error('数据保存失败:', error.message);
    }
}

function loadData() {
    try {
        // 加载用户数据
        if (fs.existsSync(path.join(__dirname, 'data', 'users.json'))) {
            const usersData = fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf8');
            users = JSON.parse(usersData);
        }
        
        // 加载预约数据
        if (fs.existsSync(path.join(__dirname, 'data', 'bookings.json'))) {
            const bookingsData = fs.readFileSync(path.join(__dirname, 'data', 'bookings.json'), 'utf8');
            bookings = JSON.parse(bookingsData);
        }
        
        // 加载评分数据
        if (fs.existsSync(path.join(__dirname, 'data', 'ratings.json'))) {
            const ratingsData = fs.readFileSync(path.join(__dirname, 'data', 'ratings.json'), 'utf8');
            ratings = JSON.parse(ratingsData);
        }
        
        // 加载计数器数据
        if (fs.existsSync(path.join(__dirname, 'data', 'counters.json'))) {
            const countersData = fs.readFileSync(path.join(__dirname, 'data', 'counters.json'), 'utf8');
            const counters = JSON.parse(countersData);
            userIdCounter = counters.userIdCounter || 1;
            bookingIdCounter = counters.bookingIdCounter || 1;
            ratingIdCounter = counters.ratingIdCounter || 1;
        }
        
        console.log('数据加载成功');
        console.log(`加载了 ${users.length} 个用户, ${bookings.length} 个预约, ${ratings.length} 个评分`);
    } catch (error) {
        console.error('数据加载失败:', error.message);
    }
}

// 服务器启动时加载数据
loadData();

// 辅助函数：检查用户发起的预约数量
function getUserBookingCount(studentId) {
    return bookings.filter(booking => 
        booking.studentId === studentId && 
        booking.status !== 'cancelled'
    ).length;
}

// 辅助函数：获取当前时间（支持测试模式）
function getCurrentTime() {
    if (testMode && virtualTime) {
        return new Date(virtualTime);
    }
    return new Date();
}

// 辅助函数：获取实际日期
function getActualDate(dayOffset) {
    const today = getCurrentTime();
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + dayOffset);
    return targetDate.toISOString().split('T')[0]; // YYYY-MM-DD格式
}

// 辅助函数：检查是否在开场前2小时内
function isWithinTwoHours(booking) {
    const now = getCurrentTime();
    const bookingDateTime = new Date(`${booking.actualDate}T${booking.time}:00:00`);
    const twoHoursBefore = new Date(bookingDateTime.getTime() - 2 * 60 * 60 * 1000);
    return now >= twoHoursBefore && now < bookingDateTime;
}

// 辅助函数：检查预约是否已开始
function isBookingStarted(booking) {
    const now = getCurrentTime();
    const bookingStartTime = new Date(`${booking.actualDate}T${booking.time}:00:00`);
    return now >= bookingStartTime;
}

// 辅助函数：检查预约是否已结束
function isBookingEnded(booking) {
    const now = getCurrentTime();
    const bookingEndTime = new Date(`${booking.actualDate}T${booking.time}:00:00`);
    bookingEndTime.setHours(bookingEndTime.getHours() + 1); // 预约时长1小时
    return now >= bookingEndTime;
}

// 辅助函数：处理预约状态
function processBookingStatus() {
    const now = getCurrentTime();
    bookings.forEach(booking => {
        if (booking.status === 'active') {
            // 如果预约已结束且参与人数≥2人，标记为已完成
            if (isBookingEnded(booking) && booking.currentPlayers >= 2) {
                booking.status = 'completed';
            }
            // 如果预约已开始且参与人数=1人，标记为已删除
            else if (isBookingEnded(booking) && booking.currentPlayers === 1) {
                booking.status = 'deleted';
            }
        }
    });
    
    // 清理已删除的预约
    bookings = bookings.filter(booking => booking.status !== 'deleted');
}

// API端点：测试模式管理（仅管理员）
app.post('/api/test-mode', (req, res) => {
    try {
        const sessionInfo = getSessionInfo(req);
        const { enabled, virtualTime: newVirtualTime } = req.body;
        
        // 验证管理员权限
        if (!sessionInfo) {
            return res.status(401).json({ 
                success: false, 
                message: '请先登录' 
            });
        }

        const { userSession } = sessionInfo;
        if (!userSession.isAdmin) {
            return res.status(403).json({ 
                success: false, 
                message: '无管理员权限' 
            });
        }

        // 更新测试模式状态
        if (enabled !== undefined) {
            testMode = enabled;
        }
        
        // 更新虚拟时间
        if (newVirtualTime) {
            virtualTime = newVirtualTime;
        }

        res.json({ 
            success: true, 
            message: '测试模式设置成功',
            testMode: testMode,
            virtualTime: virtualTime,
            currentTime: getCurrentTime().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '服务器错误: ' + error.message 
        });
    }
});

// API端点：获取测试模式状态
app.get('/api/test-mode', (req, res) => {
    try {
        const sessionInfo = getSessionInfo(req);
        
        // 验证管理员权限
        if (!sessionInfo) {
            return res.status(401).json({ 
                success: false, 
                message: '请先登录' 
            });
        }

        const { userSession } = sessionInfo;
        if (!userSession.isAdmin) {
            return res.status(403).json({ 
                success: false, 
                message: '无管理员权限' 
            });
        }

        res.json({ 
            success: true,
            testMode: testMode,
            virtualTime: virtualTime,
            currentTime: getCurrentTime().toISOString(),
            realTime: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '服务器错误: ' + error.message 
        });
    }
});

// 辅助函数：清理过期预约
function cleanupExpiredBookings() {
    const today = new Date().toISOString().split('T')[0];
    bookings = bookings.filter(booking => {
        // 保留所有已完成的预约（用于评分），只清理过期的active预约
        if (booking.status === 'completed') {
            return true; // 保留已完成的预约，直到评分完成
        }
        // 如果预约日期在今天或之后，保留active预约
        return booking.actualDate >= today;
    });
}

// API端点：创建新预约
app.post('/api/bookings', (req, res) => {
    try {
        const { name, studentId, day, time, table, maxPlayers } = req.body;
        
        // 验证必填字段
        if (!name || !studentId || !day || !time || !table || !maxPlayers) {
            return res.status(400).json({ 
                success: false, 
                message: '所有字段都是必填的' 
            });
        }

        // 检查用户发起的预约数量（最多5个）
        const userBookingCount = getUserBookingCount(studentId);
        if (userBookingCount >= 5) {
            return res.status(400).json({ 
                success: false, 
                message: '您最多只能同时发起5个预约' 
            });
        }

        // 将相对日期转换为实际日期
        let actualDate;
        if (day === 'today') {
            actualDate = getActualDate(0);
        } else if (day === 'tomorrow') {
            actualDate = getActualDate(1);
        } else if (day === 'dayAfterTomorrow') {
            actualDate = getActualDate(2);
        } else {
            // 如果是具体日期，直接使用
            actualDate = day;
        }

        // 验证日期是否在14天内
        const today = new Date();
        const todayDate = today.toISOString().split('T')[0]; // 今天的日期部分
        const maxDate = new Date(today);
        maxDate.setDate(today.getDate() + 14);
        const bookingDate = new Date(actualDate);
        
        // 只比较日期部分，不比较时间
        if (actualDate < todayDate || bookingDate > maxDate) {
            return res.status(400).json({ 
                success: false, 
                message: '只能预约今天到未来14天内的日期' 
            });
        }

        // 检查时间冲突
        const conflict = bookings.find(booking => 
            booking.actualDate === actualDate && 
            booking.time === time && 
            booking.table === table &&
            booking.status !== 'cancelled'
        );

        if (conflict) {
            return res.status(400).json({ 
                success: false, 
                message: '该时间段和球台已被预约' 
            });
        }

        const newBooking = {
            id: bookingIdCounter++,
            name,
            studentId,
            day,
            actualDate, // 存储实际日期
            time,
            table,
            maxPlayers: parseInt(maxPlayers),
            currentPlayers: 1, // 发起人自动加入
            participants: [{ name, studentId }],
            status: 'active', // 预约状态：active, cancelled
            createdAt: new Date().toISOString()
        };

        bookings.push(newBooking);
        
        // 保存数据到文件
        saveData();
        
        res.json({ 
            success: true, 
            message: '预约创建成功',
            booking: newBooking
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '服务器错误: ' + error.message 
        });
    }
});

// API端点：获取所有预约
app.get('/api/bookings', (req, res) => {
    try {
        // 处理预约状态（将已结束的预约标记为completed）
        processBookingStatus();
        
        // 清理过期预约
        cleanupExpiredBookings();
        
        // 过滤掉已取消和已完成的预约，只返回active状态的预约
        const activeBookings = bookings.filter(booking => 
            booking.status === 'active'
        );
        
        res.json({
            success: true,
            bookings: activeBookings
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '服务器错误: ' + error.message 
        });
    }
});

// API端点：加入预约
app.put('/api/bookings/:id/join', (req, res) => {
    try {
        const bookingId = parseInt(req.params.id);
        const { name, studentId } = req.body;

        if (!name || !studentId) {
            return res.status(400).json({ 
                success: false, 
                message: '姓名和学号是必填的' 
            });
        }

        const booking = bookings.find(b => b.id === bookingId);
        
        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: '预约不存在' 
            });
        }

        // 检查预约状态
        if (booking.status === 'cancelled') {
            return res.status(400).json({ 
                success: false, 
                message: '该预约已被取消' 
            });
        }

        if (booking.currentPlayers >= booking.maxPlayers) {
            return res.status(400).json({ 
                success: false, 
                message: '该预约人数已满' 
            });
        }

        // 检查是否已经加入
        const alreadyJoined = booking.participants.some(p => p.studentId === studentId);
        if (alreadyJoined) {
            return res.status(400).json({ 
                success: false, 
                message: '您已经加入该预约' 
            });
        }

        // 加入预约
        booking.participants.push({ name, studentId });
        booking.currentPlayers++;

        // 保存数据到文件
        saveData();

        res.json({ 
            success: true, 
            message: '成功加入预约',
            booking: booking
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '服务器错误: ' + error.message 
        });
    }
});

// API端点：取消预约（发起者）
app.put('/api/bookings/:id/cancel', (req, res) => {
    try {
        const bookingId = parseInt(req.params.id);
        const sessionInfo = getSessionInfo(req);

        // 验证登录状态
        if (!sessionInfo) {
            return res.status(401).json({ 
                success: false, 
                message: '请先登录' 
            });
        }

        const { userSession } = sessionInfo;
        const booking = bookings.find(b => b.id === bookingId);
        
        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: '预约不存在' 
            });
        }

        // 检查是否是预约发起者
        if (booking.studentId !== userSession.studentId) {
            return res.status(403).json({ 
                success: false, 
                message: '只有预约发起者才能取消预约' 
            });
        }

        // 检查预约状态
        if (booking.status === 'cancelled') {
            return res.status(400).json({ 
                success: false, 
                message: '该预约已被取消' 
            });
        }

        // 检查是否在开场前2小时内
        if (isWithinTwoHours(booking)) {
            return res.status(400).json({ 
                success: false, 
                message: '开场前2小时内不能取消预约，特殊情况请联系管理员' 
            });
        }

        // 检查预约是否已经开始
        if (isBookingStarted(booking)) {
            return res.status(400).json({ 
                success: false, 
                message: '预约已经开始，不能取消预约' 
            });
        }

        // 取消预约
        booking.status = 'cancelled';

        // 保存数据到文件
        saveData();

        res.json({ 
            success: true, 
            message: '预约取消成功',
            booking: booking
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '服务器错误: ' + error.message 
        });
    }
});

// API端点：退出预约（参与者）
app.put('/api/bookings/:id/leave', (req, res) => {
    try {
        const bookingId = parseInt(req.params.id);
        const sessionInfo = getSessionInfo(req);

        // 验证登录状态
        if (!sessionInfo) {
            return res.status(401).json({ 
                success: false, 
                message: '请先登录' 
            });
        }

        const { userSession } = sessionInfo;
        const booking = bookings.find(b => b.id === bookingId);
        
        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: '预约不存在' 
            });
        }

        // 检查预约状态
        if (booking.status === 'cancelled') {
            return res.status(400).json({ 
                success: false, 
                message: '该预约已被取消' 
            });
        }

        // 检查是否是发起者（发起者不能退出，只能取消）
        if (booking.studentId === userSession.studentId) {
            return res.status(400).json({ 
                success: false, 
                message: '发起者不能退出预约，请使用取消功能' 
            });
        }

        // 检查是否已加入该预约
        const participantIndex = booking.participants.findIndex(p => p.studentId === userSession.studentId);
        if (participantIndex === -1) {
            return res.status(400).json({ 
                success: false, 
                message: '您未加入该预约' 
            });
        }

        // 检查是否在开场前2小时内且参与人数等于2人
        if (isWithinTwoHours(booking) && booking.currentPlayers === 2) {
            return res.status(400).json({ 
                success: false, 
                message: '开场前2小时内且参与人数为2人时不能退出预约，特殊情况请联系管理员' 
            });
        }

        // 检查预约是否已经开始
        if (isBookingStarted(booking)) {
            return res.status(400).json({ 
                success: false, 
                message: '预约已经开始，不能退出预约' 
            });
        }

        // 退出预约
        booking.participants.splice(participantIndex, 1);
        booking.currentPlayers--;

        // 保存数据到文件
        saveData();

        res.json({ 
            success: true, 
            message: '成功退出预约',
            booking: booking
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '服务器错误: ' + error.message 
        });
    }
});

// API端点：用户注册
app.post('/api/register', (req, res) => {
    try {
        const { name, studentId, password, confirmPassword } = req.body;
        
        // 验证必填字段
        if (!name || !studentId || !password || !confirmPassword) {
            return res.status(400).json({ 
                success: false, 
                message: '所有字段都是必填的' 
            });
        }

        // 验证密码确认
        if (password !== confirmPassword) {
            return res.status(400).json({ 
                success: false, 
                message: '密码和确认密码不一致' 
            });
        }

        // 检查学号是否已注册
        const existingUser = users.find(user => user.studentId === studentId);
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: '该学号已注册' 
            });
        }

        // 创建新用户
        const newUser = {
            id: userIdCounter++,
            name,
            studentId,
            password, // 注意：实际项目中应该加密存储
            bio: "", // 个人简介
            level: 0, // 水平等级 (0: 未设置, 1-5: 萌新到国家级运动员)
            isAdmin: studentId === '25371305' && name === '刘宇轩', // 自动管理员识别
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        
        // 保存数据到文件
        saveData();
        
        // 注册成功后自动创建登录会话
        const sessionId = Math.random().toString(36).substring(2);
        sessions[sessionId] = {
            userId: newUser.id,
            studentId: newUser.studentId,
            name: newUser.name,
            isAdmin: newUser.isAdmin
        };

        res.json({ 
            success: true, 
            message: '注册成功并自动登录',
            sessionId: sessionId,
            user: { 
                id: newUser.id, 
                name: newUser.name, 
                studentId: newUser.studentId, 
                isAdmin: newUser.isAdmin 
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '服务器错误: ' + error.message 
        });
    }
});

// API端点：用户登录
app.post('/api/login', (req, res) => {
    try {
        const { studentId, password } = req.body;
        
        // 验证必填字段
        if (!studentId || !password) {
            return res.status(400).json({ 
                success: false, 
                message: '学号和密码是必填的' 
            });
        }

        // 查找用户
        const user = users.find(u => u.studentId === studentId && u.password === password);
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: '学号或密码错误' 
            });
        }

        // 创建会话
        const sessionId = Math.random().toString(36).substring(2);
        sessions[sessionId] = {
            userId: user.id,
            studentId: user.studentId,
            name: user.name,
            isAdmin: user.isAdmin
        };

        res.json({ 
            success: true, 
            message: '登录成功',
            sessionId: sessionId,
            user: { 
                id: user.id, 
                name: user.name, 
                studentId: user.studentId, 
                isAdmin: user.isAdmin 
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '服务器错误: ' + error.message 
        });
    }
});

// API端点：获取当前用户信息
app.get('/api/user', (req, res) => {
    try {
        const sessionId = req.headers.authorization || req.query.sessionId;
        
        if (!sessionId || !sessions[sessionId]) {
            return res.status(401).json({ 
                success: false, 
                message: '未登录' 
            });
        }

        const userSession = sessions[sessionId];
        res.json({ 
            success: true, 
            user: userSession 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '服务器错误: ' + error.message 
        });
    }
});

// API端点：管理员删除预约
app.delete('/api/bookings/:id', (req, res) => {
    try {
        const bookingId = parseInt(req.params.id);
        const sessionInfo = getSessionInfo(req);

        // 验证管理员权限
        if (!sessionInfo) {
            return res.status(401).json({ 
                success: false, 
                message: '请先登录' 
            });
        }

        const { userSession } = sessionInfo;
        if (!userSession.isAdmin) {
            return res.status(403).json({ 
                success: false, 
                message: '无管理员权限' 
            });
        }

        const bookingIndex = bookings.findIndex(b => b.id === bookingId);
        
        if (bookingIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                message: '预约不存在' 
            });
        }

        // 删除预约
        bookings.splice(bookingIndex, 1);
        
        // 保存数据到文件
        saveData();
        
        res.json({ 
            success: true, 
            message: '预约删除成功'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '服务器错误: ' + error.message 
        });
    }
});

// API端点：获取用户个人主页信息
app.get('/api/users/:studentId', (req, res) => {
    try {
        const { studentId } = req.params;
        
        // 查找用户
        const user = users.find(u => u.studentId === studentId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: '用户不存在' 
            });
        }

        // 返回用户信息（不包含密码）
        res.json({ 
            success: true,
            user: {
                id: user.id,
                name: user.name,
                studentId: user.studentId,
                bio: user.bio,
                level: user.level,
                isAdmin: user.isAdmin,
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '服务器错误: ' + error.message 
        });
    }
});

// API端点：更新个人简介和水平等级
app.put('/api/users/profile', (req, res) => {
    try {
        const sessionInfo = getSessionInfo(req);
        const { bio, level } = req.body;
        
        // 验证登录状态
        if (!sessionInfo) {
            return res.status(401).json({ 
                success: false, 
                message: '请先登录' 
            });
        }

        const { userSession } = sessionInfo;
        
        // 查找用户
        const user = users.find(u => u.id === userSession.userId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: '用户不存在' 
            });
        }

        // 验证水平等级范围
        if (level !== undefined && (level < 0 || level > 5)) {
            return res.status(400).json({ 
                success: false, 
                message: '水平等级必须在0-5之间' 
            });
        }

        // 更新用户信息
        if (bio !== undefined) user.bio = bio;
        if (level !== undefined) user.level = parseInt(level);

        // 保存数据到文件
        saveData();

        res.json({ 
            success: true, 
            message: '个人信息更新成功',
            user: {
                id: user.id,
                name: user.name,
                studentId: user.studentId,
                bio: user.bio,
                level: user.level,
                isAdmin: user.isAdmin
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '服务器错误: ' + error.message 
        });
    }
});

// API端点：获取所有用户列表（管理员功能）
app.get('/api/users', (req, res) => {
    try {
        const sessionInfo = getSessionInfo(req);
        
        // 验证管理员权限
        if (!sessionInfo) {
            return res.status(401).json({ 
                success: false, 
                message: '请先登录' 
            });
        }

        const { userSession } = sessionInfo;
        if (!userSession.isAdmin) {
            return res.status(403).json({ 
                success: false, 
                message: '无管理员权限' 
            });
        }

        // 返回所有用户信息（不包含密码）
        const userList = users.map(user => ({
            id: user.id,
            name: user.name,
            studentId: user.studentId,
            bio: user.bio,
            level: user.level,
            isAdmin: user.isAdmin,
            createdAt: user.createdAt
        }));

        res.json({ 
            success: true,
            users: userList
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '服务器错误: ' + error.message 
        });
    }
});

// 辅助函数：检查用户是否已完成对预约的评分
function hasUserCompletedRating(booking, studentId) {
    const allParticipants = [
        { studentId: booking.studentId },
        ...booking.participants
    ];
    
    // 获取当前用户需要评分的其他参与者
    const participantsToRate = allParticipants.filter(p => p.studentId !== studentId);
    
    // 检查当前用户是否对所有其他参与者都进行了评分
    for (const participant of participantsToRate) {
        const ratingExists = ratings.some(r => 
            r.bookingId === booking.id && 
            r.raterStudentId === studentId && 
            r.ratedStudentId === participant.studentId
        );
        
        if (!ratingExists) {
            return false;
        }
    }
    
    return true;
}

// 辅助函数：检查预约是否已完全评分
function isBookingFullyRated(booking) {
    const allParticipants = [
        { studentId: booking.studentId },
        ...booking.participants
    ];
    
    // 检查每个参与者是否都被所有其他参与者评分过
    for (const participant of allParticipants) {
        const otherParticipants = allParticipants.filter(p => p.studentId !== participant.studentId);
        
        for (const otherParticipant of otherParticipants) {
            const ratingExists = ratings.some(r => 
                r.bookingId === booking.id && 
                r.raterStudentId === participant.studentId && 
                r.ratedStudentId === otherParticipant.studentId
            );
            
            if (!ratingExists) {
                return false;
            }
        }
    }
    
    return true;
}

// 辅助函数：获取用户的评分统计
function getUserRatingStats(studentId) {
    const userRatings = ratings.filter(rating => rating.ratedStudentId === studentId);
    
    if (userRatings.length === 0) {
        return {
            skillCount: 0,
            pleasureCount: 0,
            skillDistribution: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
            pleasureDistribution: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
            avgSkill: 0,
            avgPleasure: 0
        };
    }

    const skillDistribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
    const pleasureDistribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
    
    let totalSkill = 0;
    let totalPleasure = 0;
    
    userRatings.forEach(rating => {
        skillDistribution[rating.skill]++;
        pleasureDistribution[rating.pleasure]++;
        totalSkill += rating.skill;
        totalPleasure += rating.pleasure;
    });

    return {
        skillCount: userRatings.length,
        pleasureCount: userRatings.length,
        skillDistribution,
        pleasureDistribution,
        avgSkill: totalSkill / userRatings.length,
        avgPleasure: totalPleasure / userRatings.length
    };
}

// 辅助函数：获取会话信息（支持多种方式获取sessionId）
function getSessionInfo(req) {
    const sessionId = req.headers.authorization || req.query.sessionId || req.body.sessionId;
    if (!sessionId || !sessions[sessionId]) {
        return null;
    }
    return {
        sessionId,
        userSession: sessions[sessionId]
    };
}

// API端点：获取用户的历史预约和评分信息
app.get('/api/users/:studentId/history', (req, res) => {
    try {
        const { studentId } = req.params;
        
        // 查找用户
        const user = users.find(u => u.studentId === studentId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: '用户不存在' 
            });
        }

        // 处理预约状态
        processBookingStatus();

        // 获取用户参与的历史预约（已完成状态且用户尚未完成评分）
        const historyBookings = bookings.filter(booking => 
            booking.status === 'completed' && 
            (booking.studentId === studentId || 
             booking.participants.some(p => p.studentId === studentId)) &&
            // 检查当前用户是否已完成对该预约的评分
            !hasUserCompletedRating(booking, studentId)
        );

        // 获取评分统计
        const ratingStats = getUserRatingStats(studentId);

        res.json({ 
            success: true,
            user: {
                id: user.id,
                name: user.name,
                studentId: user.studentId,
                bio: user.bio,
                level: user.level,
                isAdmin: user.isAdmin,
                createdAt: user.createdAt
            },
            historyBookings: historyBookings,
            ratingStats: ratingStats
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '服务器错误: ' + error.message 
        });
    }
});

// API端点：提交评分
app.post('/api/ratings', (req, res) => {
    try {
        const sessionId = req.headers.authorization;
        const { bookingId, ratedStudentId, skill, pleasure } = req.body;
        
        // 验证登录状态
        if (!sessionId || !sessions[sessionId]) {
            return res.status(401).json({ 
                success: false, 
                message: '请先登录' 
            });
        }

        const userSession = sessions[sessionId];
        
        // 验证必填字段
        if (!bookingId || !ratedStudentId || !skill || !pleasure) {
            return res.status(400).json({ 
                success: false, 
                message: '所有字段都是必填的' 
            });
        }

        // 验证评分范围
        if (skill < 1 || skill > 5 || pleasure < 1 || pleasure > 5) {
            return res.status(400).json({ 
                success: false, 
                message: '评分必须在1-5之间' 
            });
        }

        // 查找预约
        const booking = bookings.find(b => b.id === parseInt(bookingId));
        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: '预约不存在' 
            });
        }

        // 检查预约是否已完成
        if (booking.status !== 'completed') {
            return res.status(400).json({ 
                success: false, 
                message: '只能对已完成的预约进行评分' 
            });
        }

        // 检查评分者是否参与了该预约
        const isParticipant = booking.studentId === userSession.studentId || 
                            booking.participants.some(p => p.studentId === userSession.studentId);
        if (!isParticipant) {
            return res.status(403).json({ 
                success: false, 
                message: '只有预约参与者才能评分' 
            });
        }

        // 检查被评分者是否参与了该预约
        const isRatedParticipant = booking.studentId === ratedStudentId || 
                                 booking.participants.some(p => p.studentId === ratedStudentId);
        if (!isRatedParticipant) {
            return res.status(400).json({ 
                success: false, 
                message: '被评分者必须参与了该预约' 
            });
        }

        // 检查是否已经评分过
        const existingRating = ratings.find(r => 
            r.bookingId === parseInt(bookingId) && 
            r.raterStudentId === userSession.studentId && 
            r.ratedStudentId === ratedStudentId
        );

        if (existingRating) {
            return res.status(400).json({ 
                success: false, 
                message: '您已经对该用户进行过评分' 
            });
        }

        // 创建新评分
        const newRating = {
            id: ratingIdCounter++,
            bookingId: parseInt(bookingId),
            raterStudentId: userSession.studentId,
            ratedStudentId: ratedStudentId,
            skill: parseInt(skill),
            pleasure: parseInt(pleasure),
            createdAt: new Date().toISOString()
        };

        ratings.push(newRating);
        
        // 检查是否所有参与者都已评分，如果是则删除预约
        const allParticipants = [
            { studentId: booking.studentId },
            ...booking.participants
        ];
        
        // 检查每个参与者是否都被所有其他参与者评分过
        let allRated = true;
        for (const participant of allParticipants) {
            const otherParticipants = allParticipants.filter(p => p.studentId !== participant.studentId);
            
            for (const otherParticipant of otherParticipants) {
                const ratingExists = ratings.some(r => 
                    r.bookingId === parseInt(bookingId) && 
                    r.raterStudentId === participant.studentId && 
                    r.ratedStudentId === otherParticipant.studentId
                );
                
                if (!ratingExists) {
                    allRated = false;
                    break;
                }
            }
            if (!allRated) break;
        }
        
        // 如果所有参与者都已相互评分，则删除预约
        if (allRated) {
            const bookingIndex = bookings.findIndex(b => b.id === parseInt(bookingId));
            if (bookingIndex !== -1) {
                bookings.splice(bookingIndex, 1);
            }
        }
        
        // 保存数据到文件
        saveData();
        
        res.json({ 
            success: true, 
            message: '评分提交成功',
            rating: newRating,
            bookingDeleted: allRated
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '服务器错误: ' + error.message 
        });
    }
});

// API端点：获取所有评分数据
app.get('/api/ratings', (req, res) => {
    try {
        const sessionId = req.headers.authorization;
        
        // 验证登录状态
        if (!sessionId || !sessions[sessionId]) {
            return res.status(401).json({ 
                success: false, 
                message: '请先登录' 
            });
        }

        const userSession = sessions[sessionId];
        
        // 返回当前用户相关的评分数据
        const userRatings = ratings.filter(rating => 
            rating.raterStudentId === userSession.studentId
        );

        res.json({ 
            success: true,
            ratings: userRatings
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: '服务器错误: ' + error.message 
        });
    }
});

// API端点：返回hello world数据
app.get('/api/hello', (req, res) => {
    res.json({ message: 'Hello World!!!' });
});

// 根路径重定向到主页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'web.html'));
});

// 监听所有网络接口（适配云托管平台）
app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
});
