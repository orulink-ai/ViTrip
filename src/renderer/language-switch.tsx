import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from './components/ui/select';
import { setLocale, useLocale, type Locale } from './i18n';
export function LanguageSwitch() {
  const locale = useLocale();
  return (
    <Select value={locale} onValueChange={(value) => setLocale(value as Locale)}>
      <SelectTrigger aria-label="语言 / Language">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="zh-CN">简体中文</SelectItem>
        <SelectItem value="en">English</SelectItem>
      </SelectContent>
    </Select>
  );
}
