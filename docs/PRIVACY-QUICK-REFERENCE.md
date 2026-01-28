# 🔒 Moodle MCP Privacy Quick Reference

## The One-Minute Summary

```
When you ask AI about your students, here's what happens:

YOUR BROWSER              THE CLOUD                 AI SERVICE
┌─────────────┐          ┌─────────────┐          ┌─────────────┐
│ Real names  │   ───►   │ Only tokens │   ───►   │ Only tokens │
│ John Smith  │          │ M12345_name │          │ M12345_name │
│ Jane Doe    │          │ M67890_name │          │ M67890_name │
└─────────────┘          └─────────────┘          └─────────────┘
    ▲                                                    │
    │                                                    │
    └────────────────────────────────────────────────────┘
                    Tokens converted back
                    to names IN YOUR BROWSER
```

**Bottom line:** Student names never leave your browser. The AI only sees coded tokens.

---

## ✅ What's Protected

| Data Type | Example | What AI Sees |
|-----------|---------|--------------|
| **Names** | John Smith | `M12345_name` |
| **Emails** | jsmith@univ.edu | `M12345_email` |
| **Student IDs** | C00123456 | `M12345_CID` |

---

## 🏠 Where Data Lives

| Location | What's There | Student PII? |
|----------|--------------|--------------|
| **Your Browser** | Real names, roster mapping | ✅ Yes (temporary) |
| **MCP Server** | Your account, API keys | ❌ No |
| **AI Service** | Masked tokens only | ❌ No |
| **Moodle** | Full student records | ✅ Yes (normal) |

---

## 🆚 Compared to Alternatives

| Method | Student Names to AI? | FERPA Safe? |
|--------|---------------------|-------------|
| **Copy-paste to ChatGPT** | ⚠️ YES | ❌ Risk |
| **Export & upload** | ⚠️ YES | ❌ Risk |
| **Direct API integration** | ⚠️ YES | ❌ Risk |
| **Moodle MCP** | ✅ NO | ✅ Safe |

---

## 💡 Best Practices

### DO ✅
- Load participant list before working with a course
- Review AI content before posting to Moodle
- Keep browser extension updated

### DON'T ❌
- Type student names directly in prompts
- Share your API key
- Disable extension while using AI

---

## 🔄 How Masking Works

**When reading from Moodle:**
```
Moodle Page → Browser reads "John Smith" → Converts to "M12345_name" → Sends to AI
```

**When writing to Moodle:**
```
AI generates "M12345_name" → Browser converts to "John Smith" → Posts to Moodle
```

---

## ❓ Quick FAQ

**Q: Can the AI ever see real student names?**  
A: No. Names are converted to tokens before leaving your browser.

**Q: What if I type a student's name?**  
A: That bypasses protection. Let the AI use its tokens instead.

**Q: Is this FERPA compliant?**  
A: Yes. No student PII reaches third-party services.

**Q: What if a name isn't recognized?**  
A: Unknown names become `Joh*** Smi***` (one-way mask).

---

## 📚 Learn More

See the full [FERPA Compliance Documentation](./FERPA-COMPLIANCE.md) for:
- Detailed technical architecture
- Complete data flow diagrams
- Security considerations
- Implementation details

---

*Your students' privacy is protected by design, not by policy.*
