# gmail-imap-reader

Tool CLI **độc lập** để đọc Gmail qua **IMAP**: liệt kê mail, đọc nội dung, tìm kiếm và **lấy mã OTP** nhanh. Không phụ thuộc vào phần còn lại của dự án — có thể copy nguyên thư mục này đi nơi khác dùng.

## 1. Chuẩn bị Gmail (bắt buộc)

Gmail không cho dùng mật khẩu đăng nhập cho IMAP nữa. Anh cần **App Password**:

1. Bật **Xác minh 2 bước**: https://myaccount.google.com/security
2. Tạo **App Password** (16 ký tự): https://myaccount.google.com/apppasswords
3. IMAP mặc định đã bật (kiểm tra trong Gmail → Settings → Forwarding and POP/IMAP nếu cần).

## 2. Cài đặt

```bash
cd tools/gmail-imap-reader
npm install
```

## 3. Cấu hình

Chọn **một** trong các cách sau (thứ tự ưu tiên: flag > accounts.json > .env):

**Cách A — 1 tài khoản, dùng `.env`:**
```bash
cp .env.example .env
# rồi sửa GMAIL_USER và GMAIL_APP_PASSWORD trong .env
```

**Cách B — nhiều tài khoản, dùng `accounts.json`:**
```bash
cp accounts.example.json accounts.json
# điền danh sách account, mỗi cái có "label", "user", "appPassword"
```
Chọn account khi chạy bằng `--account <label>` hoặc `--user <email>`.

**Cách C — truyền trực tiếp:** `--user you@gmail.com --pass "abcd efgh ijkl mnop"`

> `.env` và `accounts.json` đã được `.gitignore` để không lộ mật khẩu.

## 4. Sử dụng

```bash
node src/index.js help                 # trợ giúp
node src/index.js list                 # 20 mail gần nhất
node src/index.js list --limit 10 --unread
node src/index.js list --from account-security-noreply@accountprotection.microsoft.com
node src/index.js read 1234            # đọc mail UID 1234
node src/index.js read 1234 --html     # xem bản HTML
node src/index.js search --subject "security code" --since 3
node src/index.js otp                   # lấy mã OTP mới nhất (10 phút gần đây)
node src/index.js otp --minutes 5
node src/index.js otp --wait 60         # chờ tối đa 60s tới khi có mã mới
node src/index.js otp --any             # không lọc người gửi
node src/index.js mailboxes            # liệt kê thư mục
node src/index.js accounts             # xem account đã cấu hình
```

Nhiều tài khoản:
```bash
node src/index.js list --account acc2
node src/index.js otp --user account1@gmail.com
```

## 5. Ghi chú

- **`otp`** in mã ra **stdout**, thông tin phụ ra **stderr** → dễ lấy mã để pipe:
  ```bash
  CODE=$(node src/index.js otp --wait 60)
  ```
- Mặc định `otp` lọc người gửi là `account-security-noreply@accountprotection.microsoft.com` và bắt số `\d{6,8}`. Đổi bằng `--from` / `--regex` / `--any`.
- `read` dùng `BODY.PEEK` nên **không** đánh dấu mail là đã đọc (trừ khi thêm `--mark-seen`).
- Kết nối luôn dùng TLS (port 993). App password bị xoá khoảng trắng tự động.

## Cấu trúc

```
src/
  index.js   CLI: phân tích tham số + điều phối lệnh
  config.js  Nạp credential từ flag / accounts.json / .env
  imap.js    GmailReader: connect, list, read, search, otp, waitForOtp
  format.js  In bảng / màu / định dạng ngày
```

`GmailReader` (trong `imap.js`) có thể `import` để dùng như thư viện trong script khác.
