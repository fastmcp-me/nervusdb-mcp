// Rust 测试文件
use std::collections::HashMap;
use regex::Regex;

#[derive(Debug, Clone)]
pub struct User {
    pub id: String,
    pub name: String,
    pub email: String,
}

pub struct UserService {
    users: HashMap<String, User>,
}

impl UserService {
    pub fn new() -> Self {
        Self {
            users: HashMap::new(),
        }
    }

    pub fn get_user(&self, id: &str) -> Option<&User> {
        self.users.get(id)
    }

    pub fn create_user(&mut self, user: User) {
        self.users.insert(user.id.clone(), user);
    }

    pub fn delete_user(&mut self, id: &str) -> bool {
        self.users.remove(id).is_some()
    }
}

pub fn validate_email(email: &str) -> bool {
    let pattern = r"^[^\s@]+@[^\s@]+\.[^\s@]+$";
    Regex::new(pattern)
        .map(|re| re.is_match(email))
        .unwrap_or(false)
}
