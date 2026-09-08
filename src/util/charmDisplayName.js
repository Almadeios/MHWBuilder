export const charmDisplayName = (name = '', flexible = false) => {
    const rarity = name.match(/^RARE\[([5-8])\]/)?.[1] ||
        (name.startsWith('Golden Age Charm') ? '8' : '');
    if (!rarity) { return flexible ? 'Flexible Charm' : name; }
    return `[R${rarity}] ${flexible ? 'Flexible Charm' : 'Charm'}`;
};
