// Go 测试文件
package main

import (
	"errors"
	"regexp"
	"sync"
)

type User struct {
	ID    string
	Name  string
	Email string
}

type UserService struct {
	users map[string]*User
	mu    sync.RWMutex
}

func NewUserService() *UserService {
	return &UserService{
		users: make(map[string]*User),
	}
}

func (s *UserService) GetUser(id string) (*User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	user, ok := s.users[id]
	if !ok {
		return nil, errors.New("user not found")
	}
	return user, nil
}

func (s *UserService) CreateUser(user *User) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	s.users[user.ID] = user
	return nil
}

func (s *UserService) DeleteUser(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	_, exists := s.users[id]
	if exists {
		delete(s.users, id)
	}
	return exists
}

func ValidateEmail(email string) bool {
	pattern := `^[^\s@]+@[^\s@]+\.[^\s@]+$`
	matched, _ := regexp.MatchString(pattern, email)
	return matched
}
