export const mergeById = <T extends { id: string }>(current: T[], incoming: T[]): T[] => {
    const map = new Map(current.map(item => [item.id, item]));
    incoming.forEach(item => {
        map.set(item.id, item);
    });
    return Array.from(map.values());
};
