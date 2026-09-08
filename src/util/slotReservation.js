// Remove the smallest sockets that satisfy each reservation, keeping their
// actual sizes so a returned witness can restore its free-slot inventory.
export const reserveSlots = (slots = [], wanted = []) => {
    const available = [...slots].sort((a, b) => a - b);
    const reserved = [];
    for (const size of [...wanted].sort((a, b) => b - a)) {
        const index = available.findIndex(value => value >= size);
        if (index < 0) { return null; }
        reserved.push(available.splice(index, 1)[0]);
    }
    return { available, reserved };
};
