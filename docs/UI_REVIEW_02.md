# Bản duyệt 02 — chỉnh phong cách theo Jira

Ngày 12/11/2026. Người dùng nhận xét bản đầu còn nhiều trang trí và yêu cầu sát Jira hơn.

## Thay đổi

- Header 56px, sidebar 240px, font hệ thống, nền trắng/xám và điểm nhấn xanh #0052cc.
- Bỏ tên ProjectHub, gradient, slogan, hộp quảng bá sidebar, banner preview toàn chiều ngang và huy hiệu SCRUM.
- Nhãn dữ liệu mẫu nhỏ ở header; trang production thật vẫn không có nhãn preview.
- Sprint/backlog là các nhóm danh sách phẳng, không card bo góc; hàng desktop từ 51px xuống tối thiểu 36px, tiêu đề issue 13px.
- Nút phẳng bo góc 3px, status lozenge nhỏ; tạo sprint đặt cuối backlog. Modal/panel theo cùng kiểu nút và font.
- Giữ data/actions/state, điều kiện lọc/reorder, quyền/backend và các endpoint. Chỉ sửa hai component presentation, không sửa DB/BE.

Nguồn hình thức: screenshot Scrum backlog trên https://www.atlassian.com/software/jira/templates/scrum và tài liệu https://support.atlassian.com/jira-software-cloud/docs/use-your-scrum-backlog/. Đây là giao diện phỏng theo bố cục Jira, không phải mã nguồn hoặc logo của Atlassian.

## Kiểm tra đã chạy

- `tsc --noEmit --pretty false`: đạt.
- `npm run test:planning`: 6 đạt, 0 lỗi, 0 skip. Các test này kiểm model/mapper/scope, không chứng minh bố cục hoặc tương tác trình duyệt.
- `npm run build`: đạt, gồm kiểm type và bước lint của Next.
- `git diff --check`: đạt.
- Bản preview được chạy lại tại http://127.0.0.1:3100/ui-review/backlog sau build. Người dùng tự mở link để duyệt.

Browser Use báo bị tắt trong Work settings. Người dùng chọn tự mở link localhost. Vì vậy chưa chụp ảnh hoặc kiểm lại tương tác desktop/mobile bằng trình duyệt cho bản sửa 02; không dùng screenshot của bản 01 để trình bày là bản mới. Các kết quả browser trong UI_REVIEW_01.md chỉ áp dụng commit 883721e.

Log build: outputs/jira-fe-jira-style-build.log ở workspace. Commit local riêng, không push; chờ người dùng duyệt phong cách trước khi làm Board.
