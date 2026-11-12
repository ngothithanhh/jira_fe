# Bàn giao agent ở máy khác

Tài liệu chính, phân công và prompt bắt đầu nằm ở backend:

[REMOTE_COLLABORATION.md — backend feat/backend-integration](https://github.com/ngothithanhh/jira/blob/feat/backend-integration/docs/REMOTE_COLLABORATION.md)

## Phân công đã đề xuất

- Máy hiện tại giữ FE project/issue/backlog/sprint/board, BFF/session/query/shell chung.
- Máy kia chỉ làm BE: trước tiên đối chiếu `feat/backend-integration` với `master` đang có 7 commit riêng và lập plan hợp nhất; sau khi người dùng chốt, hợp nhất/test rồi làm demo dataset/seeder/verifier/bootstrap.
- FE nền để đọc: `feat/backlog-ui-review`. BE nền đã kiểm phần 1: `feat/backend-integration`. Không clone mặc định main/master rồi cho rằng đã có toàn bộ phần 1.

## Prompt có thể gửi nguyên cho agent kia

```text
Bạn phụ trách backend của Hệ thống quản lý dự án Scrum, làm ở máy riêng.
Clone ngothithanhh/jira nhánh feat/backend-integration và jira_fe nhánh feat/backlog-ui-review vào hai thư mục cạnh nhau. FE chỉ đọc.
Đọc docs/REMOTE_COLLABORATION.md trong repo BE trước và tuân thủ quy trình plan được người dùng chốt trước khi code.
Việc đầu tiên: fetch, so sánh BE feat/backend-integration với origin/master. Có 7 commit remote riêng ở thời điểm bàn giao, 37 file cùng sửa; lập bảng trùng/khác API/schema/quyền/version/transaction, đề xuất cách giữ cả tính năng cần thiết mà chỉ còn một hợp đồng và implementation cho mỗi endpoint.
Chưa merge/code trước khi người dùng chốt plan đối chiếu. Không dùng force-push hoặc chọn toàn bộ ours/theirs. Giữ auth/context và contract mà FE phần 1 đang dùng.
Làm trên work/be-reconcile; test, commit/push nhánh của bạn, gửi SHA + thay đổi API/schema + bằng chứng test + luồng người dùng kiểm. Không push trực tiếp master hoặc nhánh nền.
Sau khi hợp nhất được duyệt mới nhận việc demo dataset trên nhánh riêng theo mục 4 của handoff: profile opt-in, DB demo riêng, khoảng 8 user/3 project/90 issue, sprint/lịch sử/report nhất quán, chạy lại không nhân bản hay ghi đè sửa tay, không có credential trong Git.
Không sửa FE hoặc làm các nhiệm vụ khác ngoài phạm vi. Sau mỗi phần đã test thì báo người dùng kiểm và dừng.
```

## Tình trạng FE hiện tại

UI demo đã có các màn của 19 nhóm chức năng tại `/ui-review` trong development. Ứng dụng thật `/app` mới nối đăng ký/login/phiên/account/context/list project chỉ đọc, theo [CONNECTED_PART1.md](CONNECTED_PART1.md). Project/issue/backlog/board thật chưa được nối đầy đủ.

Tài liệu `AGENT_START_UI.md`, `UI_FIRST_PLAN.md`, `UI_IMPLEMENTATION_HANDOFF.md` và các UI_REVIEW_* là lịch sử đợt làm giao diện, không phải nhiệm vụ mới cho agent backend. Tài khoản/DB/ảnh/log ở máy gốc không có trong Git; máy mới tự cấu hình và dựng DB riêng theo hướng dẫn BE.
