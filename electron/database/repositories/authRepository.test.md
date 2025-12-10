# AuthRepository 测试说明

## 功能测试清单

### 1. 注册功能测试
```typescript
// 测试正常注册
const result1 = await window.electronAPI.db.auth.register('testuser', '123456');
// 预期: { success: true }

// 测试重复注册
const result2 = await window.electronAPI.db.auth.register('another', '123456');
// 预期: { success: false, error: '系统已有注册用户' }

// 测试空用户名
const result3 = await window.electronAPI.db.auth.register('', '123456');
// 预期: { success: false, error: '用户名不能为空' }

// 测试短密码
const result4 = await window.electronAPI.db.auth.register('testuser', '123');
// 预期: { success: false, error: '密码长度至少为 6 位' }
```

### 2. 验证功能测试
```typescript
// 测试正确密码
const valid1 = await window.electronAPI.db.auth.verify('123456');
// 预期: true

// 测试错误密码
const valid2 = await window.electronAPI.db.auth.verify('wrongpass');
// 预期: false

// 测试空密码
const valid3 = await window.electronAPI.db.auth.verify('');
// 预期: false
```

### 3. 查询功能测试
```typescript
// 检查是否已注册
const registered = await window.electronAPI.db.auth.isRegistered();
// 预期: true (如果已注册)

// 获取用户名
const username = await window.electronAPI.db.auth.getUsername();
// 预期: 'testuser'
```

### 4. 修改密码测试
```typescript
// 测试正常修改
const result1 = await window.electronAPI.db.auth.changePassword('123456', 'newpass123');
// 预期: { success: true }

// 验证新密码
const valid = await window.electronAPI.db.auth.verify('newpass123');
// 预期: true

// 测试旧密码错误
const result2 = await window.electronAPI.db.auth.changePassword('wrongold', 'another');
// 预期: { success: false, error: '原密码错误' }

// 测试新密码太短
const result3 = await window.electronAPI.db.auth.changePassword('newpass123', '123');
// 预期: { success: false, error: '新密码长度至少为 6 位' }
```

### 5. 重置密码测试 (危险操作)
```typescript
// 直接重置密码 (无需旧密码)
const result = await window.electronAPI.db.auth.resetPassword('reset123456');
// 预期: { success: true }

// 验证新密码
const valid = await window.electronAPI.db.auth.verify('reset123456');
// 预期: true
```

## 安全性验证

### 1. 时序攻击防护
- 验证密码时,无论用户存在与否,都会执行哈希计算
- 使用 `crypto.timingSafeEqual()` 进行哈希值比较

### 2. 盐值独立性
- 每次注册/修改密码都生成新的 32 字节随机盐值
- 盐值存储在数据库中,与哈希值配合使用

### 3. 密码哈希强度
- 算法: PBKDF2-SHA512
- 迭代次数: 100,000 次
- 密钥长度: 64 字节
- 符合 OWASP 推荐标准

### 4. 错误消息安全
- 不泄露具体错误原因 (如"用户名不存在")
- 统一返回模糊错误消息

### 5. 日志安全
- 不记录密码明文
- 仅记录用户 ID 和操作类型
- 敏感操作 (如密码重置) 标记为 warn 级别

## 数据库 Schema

```sql
-- users 表 (已在 migrations.ts Version 4 中定义)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
```

## 集成测试步骤

1. 启动 Electron 应用
2. 打开开发者工具 (F12)
3. 在 Console 中逐一执行上述测试代码
4. 检查返回值是否符合预期
5. 检查 logs 目录中的日志文件,确认敏感信息未泄露

## 性能考量

- 单次密码哈希耗时约 100-200ms (100,000 次迭代)
- 可以根据硬件性能调整 `ITERATIONS` 常量
- 建议最低 10,000 次迭代,推荐 100,000 次

## 注意事项

1. **单用户系统**: 当前实现只支持单个用户账号
2. **密码重置**: `resetPassword` 方法绕过旧密码验证,应谨慎使用
3. **数据迁移**: 已有用户无法再次注册,需先删除 users 表中的数据
4. **备份恢复**: 导出数据时不应包含用户密码信息
