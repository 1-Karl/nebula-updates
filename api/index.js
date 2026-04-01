const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const app = express();

app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.get('/auth/discord', (req, res) => {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.DISCORD_REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(url);
});

app.get('/callback', async (req, res) => {
    const code = req.query.code;
    try {
        const response = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: process.env.DISCORD_REDIRECT_URI,
        }));

        const userRes = await axios.get('https://discord.com/api/users/@me', {
            headers: { authorization: `Bearer ${response.data.access_token}` }
        });

        const { id, username, avatar } = userRes.data;

        await supabase.from('perfis').upsert({
            id_discord: id,
            username: username,
            avatar: `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`
        });

        res.redirect(`/painel.html?id=${id}`);
    } catch (err) {
        res.status(500).send("Erro na autenticação.");
    }
});

app.post('/api/admin/ajustar', async (req, res) => {
    const { targetId, valor, acao, adminNome } = req.body;
    const { data: user } = await supabase.from('perfis').select('saldo').eq('id_discord', targetId).single();
    
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    let novoSaldo = user.saldo;
    let tipo = (acao === 'DEPOSITAR') ? 'Entrada' : 'Saída';

    if (acao === 'DEPOSITAR') novoSaldo += parseFloat(valor);
    else novoSaldo -= parseFloat(valor);

    await supabase.from('perfis').update({ saldo: novoSaldo }).eq('id_discord', targetId);
    await supabase.from('transacoes').insert([{
        usuario_id: targetId,
        tipo: tipo,
        descricao: acao === 'PAGAR' ? 'Pagamento Efetuado' : `${acao} manual`,
        responsavel: adminNome,
        valor: parseFloat(valor)
    }]);

    res.json({ success: true, novoSaldo });
});

app.get('/api/user/:id', async (req, res) => {
    const { data: perfil } = await supabase.from('perfis').select('*').eq('id_discord', req.params.id).single();
    const { data: transacoes } = await supabase.from('transacoes').select('*').eq('usuario_id', req.params.id).order('data', {ascending: false});
    res.json({ perfil, transacoes });
});

module.exports = app;