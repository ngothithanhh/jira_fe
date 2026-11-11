# Chỉnh giao diện theo Jira

Người dùng yêu cầu sửa bản 883721e theo phong cách Jira. Phạm vi chỉ đổi presentation Backlog, không đổi API, ID, quyền, DB hoặc logic sprint/reorder.

1. PlanningShell nhận tên/mã/ID dự án từ props cũ. Vẽ header 56px, sidebar 240px, nền xám nhạt, font hệ thống; bỏ ProjectHub, gradient, slogan và hộp quảng bá. Nhãn dữ liệu mẫu ở header preview, trang thật không có.
2. BacklogView giữ data/actions/state. Tiêu đề đơn giản, bộ lọc gọn, nhóm sprint phẳng, hàng issue desktop 36px và nút vuông 3px. Tạo sprint đặt cuối backlog; các button vẫn gọi đúng callbacks hiện có.
3. Ngày/mục tiêu/điểm lấy từ dữ liệu hiện có; chỉ đổi vị trí/định dạng. Modal/panel giữ Radix/focus cũ và dùng lời mô tả thao tác, không slogan. Không thêm field giả chưa có API.
4. Giữ mobile sidebar đóng/mở, hàng issue xuống dòng khi hẹp. Kiểm screenshot desktop/mobile, tìm kiếm, modal, panel và keyboard reorder; chạy typecheck/build và 6 test hiện có.
5. Commit FE riêng, giữ localhost chạy, mở preview và hỏi duyệt. Không tiếp tục Board trước khi người dùng duyệt.
