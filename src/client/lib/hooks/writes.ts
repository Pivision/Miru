/** 写操作的公共约定：记录写入串行化到同一个 scope、写完刷新数据、失败统一折成中文 toast。 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage, WRITE_FALLBACK } from '@/lib/api-client';
import { isNotSessionQuery } from '@/lib/hooks/query';

/** 记录写入的 scope。服务端 updateEntryFields 是「读整行再整行写回」，并发时后写的会拿旧快照覆盖前一条（记忆 #0016）；scope 让同一个 id 的 mutation 排队执行。 */
export const RECORD_SCOPE = 'record-write';

/** 写完刷新：数据量小，全量失效比逐个维护 key 更不容易漏。排除 session —— 它只在启动时取一次，陈旧的 user 没有消费者。 */
export function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ predicate: isNotSessionQuery });
  };
}

/** 一次写请求的标准收尾：成功后弹一句、按需刷新，失败统一折成中文 toast。清空表单、同步本地 state 这类副作用仍由调用方自己管。 */
export function useWrite<TData = unknown, TVariables = void>(options: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  /** 成功文案：固定字符串或按响应现算；不需要提示传 null。 */
  success?: string | null | ((data: TData, variables: TVariables) => string);
  /** 成功后额外动作。 */
  onSuccess?: (data: TData, variables: TVariables) => void;
  /** 失败后额外动作（如退回服务端值）；toast 已统一发。 */
  onError?: (error: Error, variables: TVariables) => void;
  /** 成功后是否全量刷新查询。默认 true。 */
  refresh?: boolean;
  scope?: string;
}) {
  const refresh = useRefresh();
  return useMutation<TData, Error, TVariables>({
    ...(options.scope ? { scope: { id: options.scope } } : {}),
    mutationFn: options.mutationFn,
    onSuccess: (data, variables) => {
      const text = typeof options.success === 'function' ? options.success(data, variables) : options.success;
      if (text) toast.success(text);
      options.onSuccess?.(data, variables);
      if (options.refresh !== false) refresh();
    },
    onError: (error, variables) => {
      // 失败基本都是 ApiError（自带中文 userMessage），这里的兜底只在抛出的不是 Error 时用到，所以不开放定制。
      toast.error(errorMessage(error, WRITE_FALLBACK));
      options.onError?.(error, variables);
    },
  });
}
