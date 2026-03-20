import { onMounted, watch, type Ref } from "vue";
import { readRememberedEnum, writeRememberedEnum } from "@/utils/rememberedState";

interface UseRememberedEnumRefOptions<T extends string> {
  storageKey: string;
  allowedValues: readonly T[];
  target: Ref<T>;
}

export function useRememberedEnumRef<T extends string>(options: UseRememberedEnumRefOptions<T>): void {
  const { storageKey, allowedValues, target } = options;

  onMounted(() => {
    const saved = readRememberedEnum(storageKey, allowedValues);
    if (saved) {
      target.value = saved;
    }
  });

  watch(target, (value) => {
    writeRememberedEnum(storageKey, value);
  });
}
