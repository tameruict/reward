# Gmail IMAP Tool (Electron)

App desktop **biệt lập** với bot Microsoft Rewards. Ba tab:

1. **Kích hoạt IMAP** — mở cửa sổ đăng nhập Google, bạn tự đăng nhập (mật khẩu + 2FA), tool bắt **App Password** 16 ký tự và lưu lại (mã hoá bằng `safeStorage` của hệ điều hành).
2. **Đọc Inbox** — chọn tài khoản đã lưu (hoặc nhập tay email + app password) để đọc hòm thư, mở nội dung mail, và lấy nhanh **mã OTP**.
3. **Microsoft Rewards** — lưu danh sách account và mở trang Rewards trong cửa sổ Chromium riêng. Mỗi account có profile bền vững riêng để giữ cookie/phiên đăng nhập mà không lưu mật khẩu Microsoft.

## Cài đặt

```bash
cd tools/gmail-imap-tool
npm install
```

> `npm install` sẽ tải Electron (~vài trăm MB) trong lần đầu.

## Chạy

```bash
npm start
```

## Cách dùng

### Tab "Kích hoạt IMAP" (bán tự động)
1. Nhập địa chỉ Gmail → bấm **Mở trình duyệt & lấy App Password**.
2. Cửa sổ Google mở ra → **tự đăng nhập** (mật khẩu, 2FA, captcha nếu có).
3. Khi tới trang App Password: nhập tên bất kỳ (vd "imap") → **Create**.
4. Tool tự bắt mã 16 ký tự, hiển thị + lưu cho email đó. (Nút **Copy** để sao chép.)
5. Nút **Mở cài đặt IMAP** để kiểm tra/bật IMAP trong Gmail nếu cần (Gmail thường bật sẵn).

Nếu đã có sẵn App Password: dùng ô **"Hoặc nhập tay App Password"** để lưu trực tiếp.

### Tab "Đọc Inbox"
1. Chọn tài khoản trong dropdown (hoặc **➕ Nhập tay…** rồi điền email + app password).
   - Có thể bấm **Lưu account** để dùng lại ở lần mở app sau.
   - Proxy là tùy chọn; để trống để kết nối trực tiếp.
2. Chỉnh số lượng / lọc chưa đọc / lọc người gửi → **Tải inbox**.
3. Bấm 1 dòng để xem nội dung (có nút chuyển **text ⇄ HTML**).
4. **Lấy OTP**: quét mã xác minh (mặc định từ Microsoft, 15 phút gần đây) và tự copy.

### Proxy tùy chọn

- Hỗ trợ HTTP, HTTPS, SOCKS4 và SOCKS5.
- Các định dạng được chấp nhận: `host:port`, `host:port:user:pass`, `http://user:pass@host:port`, `socks5://user:pass@host:port`.
- Proxy được lưu riêng theo từng account và chỉ dùng cho kết nối IMAP. Proxy có thông tin đăng nhập được mã hóa cùng App Password.
- Danh sách account chỉ hiển thị địa chỉ proxy đã che thông tin đăng nhập.

### Tab "Microsoft Rewards"

1. Nhập email Microsoft và tên gợi nhớ → **Lưu account**.
2. Chọn account → **Mở Chromium để tham gia**.
3. Đăng nhập trong cửa sổ Chromium ở lần đầu. Cookie và phiên đăng nhập được giữ trong profile riêng của account để dùng lại ở lần sau.
4. **Xoá account** sẽ xóa metadata và dọn phiên Chromium đã lưu.

App không lưu mật khẩu Microsoft. Mỗi email Rewards được ánh xạ tới một Chromium partition `persist:` riêng.

## Yêu cầu về Gmail

- Muốn tạo **App Password** thì tài khoản phải **bật xác minh 2 bước** trước.
- IMAP trên Gmail hầu hết đã **bật sẵn mặc định**.
- Nếu Google báo "browser may not be secure": thử đăng nhập lại, hoặc đăng nhập trên trình duyệt thật một lần cho quen thiết bị rồi thử lại.

## Bảo mật

- App Password và proxy lưu tại thư mục userData của app, **mã hoá** qua `safeStorage` (DPAPI trên Windows). Mật khẩu giải mã chỉ nằm ở tiến trình chính, **không gửi ngược ra giao diện**.
- Mỗi Gmail dùng 1 phiên đăng nhập riêng (`persist:gmail-<email>`), tách biệt nhau.
- Không nhập/lưu mật khẩu đăng nhập Gmail — chỉ dùng App Password cho IMAP.

## Đóng gói ra .exe (tuỳ chọn)

Cài `electron-builder` rồi `npm run dist` (cần cấu hình thêm `build` trong package.json).

## Cấu trúc

```
main.js            Electron main: cửa sổ + IPC + điều phối
preload.js         Cầu nối an toàn renderer ⇄ main (contextBridge)
src/
  imap.js          GmailReader: connect/list/read/otp (imapflow + mailparser)
  store.js         Lưu App Password (mã hoá safeStorage)
  activate.js      Cửa sổ đăng nhập + bắt App Password
renderer/
  index.html       Giao diện 2 tab
  styles.css       Theme tối
  renderer.js      Logic giao diện
```
