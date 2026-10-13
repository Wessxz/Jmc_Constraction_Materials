# 🤝 Contributing to JMC Hardware Project

## 📋 Pull Request Workflow

This project uses **Pull Requests** for code contributions. This ensures code quality and prevents accidental breaking changes.

---

## 🚀 Step-by-Step Guide for Team Members

### 1️⃣ Clone the Repository (One-time setup)

```bash
# Clone the main repository
git clone https://github.com/Wessxz/Jmc_Constraction_Materials.git
cd Jmc_Constraction_Materials

# Set up your .env file
copy .env.example .env
# Edit .env with your local settings
```

---

### 2️⃣ Before Making Changes

**Always pull the latest changes first:**

```bash
# Make sure you're on master branch
git checkout master

# Pull latest changes
git pull origin master
```

---

### 3️⃣ Create a New Branch

**NEVER work directly on master branch!**

```bash
# Create and switch to a new branch
git checkout -b feature/your-feature-name

# Examples:
git checkout -b feature/add-search-function
git checkout -b fix/login-bug
git checkout -b update/dashboard-ui
```

**Branch naming conventions:**
- `feature/` - New features
- `fix/` - Bug fixes
- `update/` - Updates to existing features
- `refactor/` - Code refactoring
- `docs/` - Documentation updates

---

### 4️⃣ Make Your Changes

1. Write your code
2. Test thoroughly
3. Make sure it works locally

```bash
# Check which files you changed
git status

# Add files to staging
git add .

# Or add specific files
git add path/to/file.php

# Commit with a descriptive message
git commit -m "Add: User search functionality in admin panel"
```

**Commit message format:**
- `Add:` - New features
- `Fix:` - Bug fixes
- `Update:` - Changes to existing features
- `Remove:` - Deleted features
- `Refactor:` - Code improvements

**Examples:**
```bash
git commit -m "Add: Search bar in products page"
git commit -m "Fix: Login redirect issue on admin panel"
git commit -m "Update: Dashboard delivery count calculation"
```

---

### 5️⃣ Push Your Branch

```bash
# Push your branch to GitHub
git push origin feature/your-feature-name

# Example:
git push origin feature/add-search-function
```

---

### 6️⃣ Create Pull Request on GitHub

1. Go to: https://github.com/Wessxz/Jmc_Constraction_Materials
2. You'll see a banner: **"Compare & pull request"** → Click it
3. Fill in the PR template:

**Title:** Short description (e.g., "Add search functionality")

**Description:**
```markdown
## What does this PR do?
- Added search bar in products page
- Implemented real-time search filtering
- Added keyboard shortcuts (Ctrl+K)

## How to test?
1. Go to products page
2. Type in search bar
3. Verify results are filtered correctly

## Screenshots (if applicable)
[Add screenshots here]

## Checklist
- [x] Tested locally
- [x] No console errors
- [x] Follows code style
- [x] Updated documentation (if needed)
```

4. Click **"Create Pull Request"**

---

### 7️⃣ Wait for Review

**What happens next:**
1. **Wessxz** will review your code
2. You may get comments or change requests
3. Make requested changes if needed
4. Push again to update the PR

**If changes are requested:**
```bash
# Make the changes
# Then commit and push again
git add .
git commit -m "Fix: Address review comments"
git push origin feature/your-feature-name
```

The PR will automatically update!

---

### 8️⃣ After Merge

**Once your PR is approved and merged:**

```bash
# Switch back to master
git checkout master

# Pull the merged changes
git pull origin master

# Delete your old branch (optional)
git branch -d feature/your-feature-name
```

**Now you can create a new branch for your next feature!**

---

## ⚠️ Common Issues & Solutions

### Conflict Error

**Problem:** "This branch has conflicts that must be resolved"

**Solution:**
```bash
# Make sure you're on your branch
git checkout feature/your-feature-name

# Pull latest master
git pull origin master

# Resolve conflicts in files
# Look for <<<<<<, =======, >>>>>> markers
# Edit files to keep what you want

# After resolving:
git add .
git commit -m "Fix: Resolve merge conflicts"
git push origin feature/your-feature-name
```

---

### Behind Master Branch

**Problem:** "This branch is X commits behind master"

**Solution:**
```bash
# Update your branch with latest master
git checkout feature/your-feature-name
git pull origin master
git push origin feature/your-feature-name
```

---

### Accidentally Committed to Master

**Problem:** Made changes directly on master branch

**Solution:**
```bash
# Create a branch with your changes
git checkout -b feature/my-changes

# Push this branch
git push origin feature/my-changes

# Reset master to remote
git checkout master
git reset --hard origin/master
```

---

## 📝 Code Review Checklist

Before submitting your PR, make sure:

### ✅ Code Quality
- [ ] Code follows project structure
- [ ] No console.log() left in code
- [ ] No commented-out code
- [ ] Proper indentation
- [ ] Meaningful variable names

### ✅ Testing
- [ ] Tested on local environment
- [ ] No browser console errors
- [ ] No PHP errors in logs
- [ ] Works on Chrome/Firefox/Edge

### ✅ Database
- [ ] No hardcoded credentials
- [ ] SQL files provided (if schema changed)
- [ ] No breaking changes to existing data

### ✅ Files
- [ ] `.env` NOT included
- [ ] No temporary files
- [ ] No test files (unless intentional)
- [ ] Images optimized (if applicable)

### ✅ Documentation
- [ ] Updated README (if needed)
- [ ] Added comments for complex code
- [ ] Updated SETUP_INSTRUCTIONS (if needed)

---

## 🎯 Best Practices

### DO's ✅
- Create descriptive branch names
- Write clear commit messages
- Test thoroughly before pushing
- Keep PRs focused (one feature per PR)
- Respond to review comments promptly
- Pull latest master before creating branch

### DON'Ts ❌
- Don't work directly on master branch
- Don't push untested code
- Don't include `.env` file
- Don't make huge PRs (break into smaller ones)
- Don't ignore review comments
- Don't force push to shared branches

---

## 🚨 Emergency: Rollback Changes

**If something breaks production:**

```bash
# Check commit history
git log --oneline

# Revert to previous commit
git revert <commit-hash>

# Or reset to specific commit (CAREFUL!)
git reset --hard <commit-hash>
git push origin master --force
```

⚠️ **Only do this in emergency!** Always better to fix forward.

---

## 👥 Team Workflow Summary

```
1. git checkout master
2. git pull origin master
3. git checkout -b feature/my-new-feature
4. [Make changes]
5. git add .
6. git commit -m "Add: My new feature"
7. git push origin feature/my-new-feature
8. [Create PR on GitHub]
9. [Wait for review]
10. [PR gets merged]
11. git checkout master
12. git pull origin master
13. [Repeat for next feature]
```

---

## 📞 Need Help?

**Common commands:**
```bash
# Check current branch
git branch

# Check status
git status

# View commit history
git log --oneline

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Discard all local changes
git reset --hard HEAD
```

**Still stuck?** Ask in the team chat or contact **Wessxz**!

---

## 🔗 Useful Links

- **Repository:** https://github.com/Wessxz/Jmc_Constraction_Materials
- **Pull Requests:** https://github.com/Wessxz/Jmc_Constraction_Materials/pulls
- **Issues:** https://github.com/Wessxz/Jmc_Constraction_Materials/issues

---

**Happy Coding! 🚀**

*Remember: Review > Direct Push*
