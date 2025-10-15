# Python 测试文件
from typing import Optional, Dict
from dataclasses import dataclass

@dataclass
class User:
    id: str
    name: str
    email: str

class UserService:
    def __init__(self):
        self.users: Dict[str, User] = {}
    
    async def get_user(self, user_id: str) -> Optional[User]:
        """获取用户信息"""
        return self.users.get(user_id)
    
    async def create_user(self, user: User) -> None:
        """创建新用户"""
        self.users[user.id] = user
    
    async def delete_user(self, user_id: str) -> bool:
        """删除用户"""
        if user_id in self.users:
            del self.users[user_id]
            return True
        return False

def validate_email(email: str) -> bool:
    """验证邮箱格式"""
    import re
    pattern = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
    return bool(re.match(pattern, email))
