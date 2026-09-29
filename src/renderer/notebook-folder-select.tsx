import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import { t } from './i18n';
export function NotebookFolderSelect({
  folders,
  value,
  onChange,
}: {
  folders: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value || '__root__'}
      onValueChange={(value) => onChange(value === '__root__' ? '' : value)}
    >
      <SelectTrigger aria-label={t('所在文件夹')} className="min-w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__root__">{t('笔记根目录')}</SelectItem>
        {folders.map((folder) => (
          <SelectItem key={folder} value={folder}>
            {folder}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
