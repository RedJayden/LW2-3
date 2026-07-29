/**
 * @file NotificationLogQueue.tsx
 * @brief 시스템 알림 및 통신 에러 메시지를 표시하는 하단 상태바 큐 컨트롤
 * @details 메시지 클릭 시 상세 로그 창이나 설정 창을 띄울 수 있는 인터랙션을 포함한다.
 */
import useAppStore from "@/store/appStore";
import useLogStore from "@/store/logStore";
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';

export default function NotificationLogQueue() {
  const commError = useAppStore(s => s.motion.commError);
  const commErrorMessage = useAppStore(s => s.motion.commErrorMessage);
  const sysNotification = useAppStore(s => s.notification);
  const toggleLogPanel = useLogStore(s => s.toggleLogPanel);
  const logs = useLogStore(s => s.logs);
  
  let hasError = commError || sysNotification.type === 'error';
  // If there are logs, show the latest log message, otherwise default to System Normal.
  let defaultMsg = sysNotification.message || (commError ? commErrorMessage : "System Normal");
  let message = logs.length > 0 ? logs[logs.length - 1].message : defaultMsg;
  
  let iconColor = hasError ? "text-red-400" : (sysNotification.type === "warning" ? "text-yellow-400" : "text-green-400");

  return (
    <div 
      className="flex flex-row items-center px-4 text-xs text-gray-400 w-full cursor-pointer hover:bg-white/10 hover:text-white transition-colors h-full"
      onClick={() => toggleLogPanel()}
    >
      <div className="mr-2 flex items-center shrink-0">
         {hasError ? <NotificationsActiveIcon fontSize="small" className={`animate-pulse ${iconColor}`} /> : <NotificationsIcon fontSize="small" className={iconColor} />}
      </div>
      <span className="truncate flex-1">{message}</span>
    </div>
  );
}
