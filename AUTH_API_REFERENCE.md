# 认证系统 API 快速参考

## 前端调用示例

### 检查注册状态
```typescript
const isRegistered = await window.electronAPI.db.auth.isRegistered();
if (!isRegistered) {
    // 显示注册界面
} else {
    // 显示登录界面
}
```

### 注册新用户
```typescript
const result = await window.electronAPI.db.auth.register('username', 'password');
if (result.success) {
    // 注册成功,自动登录
} else {
    // 显示错误: result.error
}
```

### 登录验证
```typescript
const isValid = await window.electronAPI.db.auth.login('password');
if (isValid) {
    // 登录成功
} else {
    // 密码错误
}
```

### 获取当前用户名
```typescript
const username = await window.electronAPI.db.auth.getUsername();
console.log('当前用户:', username);
```

### 修改密码
```typescript
const result = await window.electronAPI.db.auth.changePassword('oldpass', 'newpass');
if (result.success) {
    // 修改成功
} else {
    // 显示错误: result.error
}
```

### 工厂重置 (危险!)
```typescript
if (confirm('此操作将删除所有数据,确定继续?')) {
    const result = await window.electronAPI.db.auth.reset();
    if (result.success) {
        window.location.reload();
    }
}
```

## 错误处理

所有方法都有完善的错误处理,不会抛出异常。

**register / changePassword / resetPassword / reset** 返回:
```typescript
{ success: true }  // 成功
{ success: false, error: '错误消息' }  // 失败
```

**verify / login** 返回:
```typescript
true   // 密码正确
false  // 密码错误
```

**isRegistered** 返回:
```typescript
true   // 已有用户
false  // 未注册
```

**getUsername** 返回:
```typescript
'username'  // 用户名
null        // 无用户
```

## 密码要求

- 最小长度: 6 位
- 建议: 8 位以上,包含大小写字母和数字

## 安全特性

- PBKDF2-SHA512 哈希 (100,000 次迭代)
- 32 字节随机盐值
- 时序攻击防护
- 日志不记录敏感信息
