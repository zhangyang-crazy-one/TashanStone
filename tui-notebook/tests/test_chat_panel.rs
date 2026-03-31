use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use tui_notebook::action::{Action, ChatAction};
use tui_notebook::components::chat::{ChatPanel, MessageRole};

#[test]
fn chat_session_switching_preserves_history() {
    let mut panel = ChatPanel::new();
    panel.toggle();
    panel.set_runtime_preferences("main_and_isolated".to_string(), true);

    let main_id = panel.active_session_id();
    panel.insert_text("main message");
    let action = panel
        .handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE))
        .expect("send action");
    let session_id = match action {
        Action::Chat(ChatAction::Send { session_id, .. }) => session_id,
        other => panic!("unexpected action: {other:?}"),
    };
    assert_eq!(session_id, main_id);
    assert_eq!(panel.active_message_count(), 1);

    panel.handle_action(&ChatAction::CreateSession);
    assert_eq!(panel.session_count(), 2);
    let isolated_id = panel.active_session_id();
    assert_ne!(isolated_id, main_id);
    assert_eq!(panel.active_message_count(), 0);

    panel.insert_text("isolated only");
    let action = panel
        .handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE))
        .expect("send action");
    let isolated_send = match action {
        Action::Chat(ChatAction::Send { session_id, .. }) => session_id,
        other => panic!("unexpected action: {other:?}"),
    };
    assert_eq!(isolated_send, isolated_id);
    assert_eq!(panel.active_message_count(), 1);

    panel.handle_action(&ChatAction::SelectPrevSession);
    assert_eq!(panel.active_session_id(), main_id);
    assert_eq!(panel.active_message_count(), 1);
    assert_eq!(panel.session_contents(&main_id), vec!["main message".to_string()]);

    panel.handle_action(&ChatAction::SelectNextSession);
    assert_eq!(panel.active_session_id(), isolated_id);
    assert_eq!(
        panel.session_contents(&isolated_id),
        vec!["isolated only".to_string()]
    );
}

#[test]
fn multiline_chat_input_and_controls_work() {
    let mut panel = ChatPanel::new();
    panel.toggle();
    panel.set_runtime_preferences("main_and_isolated".to_string(), true);

    panel.insert_text("hello");
    panel.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::SHIFT));
    panel.insert_text("world");
    assert_eq!(panel.input_value(), "hello\nworld");

    let compact_action = panel
        .handle_key_event(KeyEvent::new(KeyCode::Char('b'), KeyModifiers::CONTROL))
        .expect("compact shortcut");
    assert!(matches!(
        compact_action,
        Action::Chat(ChatAction::Compact { .. })
    ));

    let clear_action = panel
        .handle_key_event(KeyEvent::new(KeyCode::Char('l'), KeyModifiers::CONTROL))
        .expect("clear shortcut");
    assert!(matches!(clear_action, Action::Chat(ChatAction::Clear { .. })));

    let session_id = panel.active_session_id();
    for index in 0..3 {
        panel.handle_action(&ChatAction::StreamResponse {
            session_id: session_id.clone(),
            chunk: format!("assistant {index}"),
        });
        panel.handle_action(&ChatAction::StreamFinished {
            session_id: session_id.clone(),
        });
        panel.insert_text(&format!("user {index}"));
        let _ = panel.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE));
    }

    panel.handle_action(&ChatAction::Compact {
        session_id: session_id.clone(),
    });
    let roles = panel.session_roles(&session_id);
    let contents = panel.session_contents(&session_id);
    assert_eq!(roles.first().copied(), Some(MessageRole::System));
    assert!(
        contents.first().is_some_and(|content| content.contains("Compacted summary")),
        "expected a compacted summary system message"
    );

    panel.handle_action(&ChatAction::Clear {
        session_id: session_id.clone(),
    });
    assert!(panel.session_contents(&session_id).is_empty());
}

#[test]
fn chat_stream_status_updates_on_stream_actions() {
    let mut panel = ChatPanel::new();
    panel.toggle();
    let session_id = panel.active_session_id();

    panel.insert_text("status test");
    let _ = panel.handle_key_event(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE));
    assert_eq!(panel.runtime_status_label(), "assembling context");

    panel.handle_action(&ChatAction::StreamStarted {
        session_id: session_id.clone(),
    });
    assert_eq!(panel.runtime_status_label(), "streaming");

    panel.handle_action(&ChatAction::Cancel {
        session_id: session_id.clone(),
    });
    assert_eq!(panel.runtime_status_label(), "stopped");
}
