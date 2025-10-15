// Java 测试文件
package com.example.user;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

public class UserService {
    private final Map<String, User> users = new HashMap<>();
    private static final Pattern EMAIL_PATTERN = 
        Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    public Optional<User> getUser(String id) {
        return Optional.ofNullable(users.get(id));
    }

    public void createUser(User user) {
        users.put(user.getId(), user);
    }

    public boolean deleteUser(String id) {
        return users.remove(id) != null;
    }

    public static boolean validateEmail(String email) {
        return EMAIL_PATTERN.matcher(email).matches();
    }
}

class User {
    private final String id;
    private final String name;
    private final String email;

    public User(String id, String name, String email) {
        this.id = id;
        this.name = name;
        this.email = email;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getEmail() {
        return email;
    }
}
