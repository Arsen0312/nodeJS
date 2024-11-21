const axios = require('axios');
const { google } = require('googleapis');
const readline = require('readline');

class DContractAPI {
    constructor() {
        this.baseURL = 'http://94.103.91.4:5000';
        this.token = null;
    }

    async register() {
        try {
            // Генерируем уникальное имя пользователя
            const username = `user_${Date.now()}`;

            const response = await axios.post(`${this.baseURL}/auth/registration`, {
                username
            });

            console.log('Пользователь зарегистрирован:', username);
            return username;
        } catch (error) {
            console.error('Ошибка регистрации:', error.response?.data || error.message);
            throw error;
        }
    }

    async login(username) {
        try {
            const response = await axios.post(`${this.baseURL}/auth/login`, {
                username
            });

            this.token = response.data.token;
            console.log('Токен авторизации получен');
            return this.token;
        } catch (error) {
            console.error('Ошибка авторизации:', error.response?.data || error.message);
            throw error;
        }
    }

    async getAllClients() {
        const clients = [];
        let offset = 0;
        const limit = 1000;

        try {
            while (true) {
                const response = await axios.get(`${this.baseURL}/clients`, {
                    headers: { 'Authorization': this.token },
                    params: { limit, offset }
                });

                const fetchedClients = response.data;

                if (fetchedClients.length === 0) break;

                // Получаем статусы для клиентов
                const userIds = fetchedClients.map(client => client.id);
                const statusesResponse = await axios.post(`${this.baseURL}/clients`,
                    { userIds },
                    { headers: { 'Authorization': this.token } }
                );

                const statuses = statusesResponse.data;

                // Объединяем данные клиентов со статусами
                const enrichedClients = fetchedClients.map(client => {
                    const status = statuses.find(s => s.userId === client.id)?.status || 'Неизвестен';
                    return { ...client, status };
                });

                clients.push(...enrichedClients);
                offset += limit;
            }

            return clients;
        } catch (error) {
            console.error('Ошибка получения клиентов:', error.response?.data || error.message);
            throw error;
        }
    }

    async exportToGoogleSheets(clients) {
        // Создаем клиент Google Sheets API
        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        const sheets = google.sheets({ version: 'v4', auth });

        try {
            // Создаем новую таблицу
            const spreadsheet = await sheets.spreadsheets.create({
                resource: {
                    properties: {
                        title: 'DContract Clients'
                    }
                }
            });

            const spreadsheetId = spreadsheet.data.spreadsheetId;

            // Подготавливаем данные для записи
            const headers = ['id', 'firstName', 'lastName', 'gender', 'address', 'city', 'phone', 'email', 'status'];
            const values = [
                headers,
                ...clients.map(client => [
                    client.id.toString(),
                    client.firstName,
                    client.lastName,
                    client.gender,
                    client.address,
                    client.city,
                    client.phone,
                    client.email,
                    client.status
                ])
            ];

            // Записываем данные в лист
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: 'Sheet1',
                valueInputOption: 'RAW',
                resource: { values }
            });

            console.log('Данные экспортированы в Google Sheets');
            console.log(`Ссылка на таблицу: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);

            return spreadsheetId;
        } catch (error) {
            console.error('Ошибка экспорта в Google Sheets:', error);
            throw error;
        }
    }

    async run() {
        try {
            const username = await this.register();
            await this.login(username);
            const clients = await this.getAllClients();
            await this.exportToGoogleSheets(clients);
        } catch (error) {
            console.error('Ошибка выполнения задачи:', error);
        }
    }
}

// Экспортируем класс для возможности импорта
module.exports = DContractAPI;

// Если скрипт запускается напрямую, выполняем задачу
if (require.main === module) {
    const api = new DContractAPI();
    api.run();
}