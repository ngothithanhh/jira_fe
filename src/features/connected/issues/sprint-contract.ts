export type SprintPatch = { sprintName?: string; goal?: string; startDate?: string; endDate?: string };

/** So thời gian địa phương theo lịch, giữ phần giây lẻ và không phụ thuộc múi giờ của trình duyệt. */
export function localSprintTime(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/.exec(value);
  if (!match) throw new Error('Thời gian sprint không hợp lệ.');
  const [, year, month, day, hour, minute, second = '00', fraction = ''] = match;
  const leap = Number(year) % 4 === 0 && (Number(year) % 100 !== 0 || Number(year) % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Number(month) - 1];
  if (year === '0000' || !days || Number(day) < 1 || Number(day) > days || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
    throw new Error('Thời gian sprint không hợp lệ.');
  }
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${fraction.padEnd(9, '0')}`;
}

export function validateSprintDates(start?: string | null, end?: string | null) {
  if (start && end && localSprintTime(start) >= localSprintTime(end)) {
    throw new Error('Ngày kết thúc phải sau ngày bắt đầu.');
  }
}

/** Chỉ nhận metadata sprint. Field null là giữ nguyên theo hợp đồng PATCH. */
export function sprintPatch(input: unknown): SprintPatch {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Dữ liệu sprint không hợp lệ.');
  const patch: SprintPatch = {};
  for (const [field, value] of Object.entries(input)) {
    if (field !== 'sprintName' && field !== 'goal' && field !== 'startDate' && field !== 'endDate') {
      throw new Error('Trường cập nhật sprint không hợp lệ.');
    }
    if (value === null) continue;
    if (typeof value !== 'string') throw new Error('Dữ liệu sprint không hợp lệ.');
    if (field === 'sprintName' && (!value.trim() || value.length > 100)) throw new Error('Tên sprint cần từ 1 đến 100 ký tự.');
    if (field === 'goal' && value.length > 255) throw new Error('Mục tiêu sprint tối đa 255 ký tự.');
    if (field === 'startDate' || field === 'endDate') localSprintTime(value);
    patch[field] = field === 'sprintName' ? value.trim() : value;
  }
  validateSprintDates(patch.startDate, patch.endDate);
  return patch;
}
