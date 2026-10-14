// options.js
module.exports = {
    options: [
        {
            id: "single_team_mode",
            name: "Режим одной команды (Синяя)",
            type: "boolean",
            defaultValue: true, // По умолчанию включено
            description: "Все игроки попадают в синюю команду автоматически."
        },
        {
            id: "infinite_time",
            name: "Бесконечное время",
            type: "boolean",
            defaultValue: true,
            description: "Отключает таймер раунда."
        }
    ]
};
