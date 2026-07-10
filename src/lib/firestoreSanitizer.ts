export function removeUndefinedFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => removeUndefinedFields(entry)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([entryKey, entryValue]) => [entryKey, removeUndefinedFields(entryValue)]),
    ) as T;
  }

  return value;
}
